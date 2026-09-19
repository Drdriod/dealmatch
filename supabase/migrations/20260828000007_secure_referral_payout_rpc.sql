-- ============================================================================
-- Move referral/loyalty-points crediting off the client entirely.
--
-- src/lib/referral.js currently computes payout amounts in the browser and
-- writes them straight to loyalty_points and referral_transactions. The
-- previous migration (20260828000006) stopped User A from crediting a
-- transaction to User B's account, but did nothing to stop a user from
-- inflating their OWN balance - the amounts themselves were never
-- validated against anything real, only the ownership of the row.
--
-- Two more things turned up while building this:
--
--  1) processReferralPayouts() is imported into AdminPage.jsx but never
--     actually called anywhere - it's dead code today, not a live feature.
--     That makes this a clean cutover rather than a breaking change.
--
--  2) referral_transactions.referee_id, .deal_amount and .platform_fee are
--     all NOT NULL with no default, but neither client insert (the payout
--     path or the redeemPoints() path) ever set them. Both inserts were
--     already failing silently in production (supabase-js does not throw
--     on a Postgres error unless you check the returned `error` yourself,
--     and neither call site did) - meaning redemption requests were being
--     "submitted" to the user while no record was ever actually created
--     for an admin to pay out. This migration fixes that bug as a side
--     effect of doing the inserts correctly.
--
-- Design: the transactions table already captures commission_amount_cents
-- once, immutably, at COMPLETED (see 20260731000014/20260731000019) - and
-- explicitly leaves it NULL until the platform sets a real commission rate,
-- rather than guessing one. This RPC honors that: it refuses to run until
-- a real commission value exists on the transaction, instead of inventing
-- one the way a client-side rewrite risked doing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Prevent double-processing: once a transaction's referral payouts have
-- been run, they cannot be run again for the same transaction.
-- ----------------------------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS referral_payout_processed_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- redeem_loyalty_points(): self-service, replaces the client-side
-- read-balance-then-write-balance pattern in redeemPoints() with a single
-- atomic, row-locked operation. The cash value is computed here from the
-- validated points amount, never trusted from the client.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(p_points INTEGER)
RETURNS TABLE (new_balance INTEGER, cash_value NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loyalty public.loyalty_points%ROWTYPE;
  v_cash_value NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'must be signed in to redeem points';
  END IF;
  IF p_points < 100 OR p_points % 100 <> 0 THEN
    RAISE EXCEPTION 'points must be redeemed in multiples of 100, minimum 100';
  END IF;

  SELECT * INTO v_loyalty FROM public.loyalty_points WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR v_loyalty.points_balance < p_points THEN
    RAISE EXCEPTION 'insufficient points balance';
  END IF;

  v_cash_value := FLOOR(p_points::NUMERIC / 100) * 10000;

  PERFORM set_config('app.trusted_role_grant', 'true', true);

  UPDATE public.loyalty_points
  SET points_balance = points_balance - p_points,
      points_redeemed = COALESCE(points_redeemed, 0) + p_points,
      updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.referral_transactions (
    referrer_id, referee_id, transaction_type, deal_amount, platform_fee,
    referral_rate, payout_type, points_redeemed, referral_earning, status
  ) VALUES (
    auth.uid(), auth.uid(), 'subscription', 0, 0,
    0, 'points_redemption', p_points, v_cash_value, 'pending'
  );

  RETURN QUERY SELECT (v_loyalty.points_balance - p_points), v_cash_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- process_referral_payouts_for_transaction(): admin-triggered, walks the
-- real referral chain (profiles.invited_by) server-side and credits cash
-- or points using the same tier logic src/lib/referral.js already
-- documents, but computed here from the transaction's own immutable
-- commission_amount_cents instead of a client-supplied number.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_referral_payouts_for_transaction(
  p_transaction_id BIGINT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_dm_commission NUMERIC;
  v_deal_amount NUMERIC;
  v_tier TEXT;
  v_current_id UUID;
  v_referrer_id UUID;
  v_referee_id UUID;
  v_level INTEGER := 1;
  v_seen UUID[];
  v_cash_amount NUMERIC;
  v_points INTEGER;
  v_existing public.loyalty_points%ROWTYPE;
  v_payouts_made INTEGER := 0;
BEGIN
  IF NOT (public.get_my_role() IN ('admin', 'superadmin') OR public.is_admin_staff()) THEN
    RAISE EXCEPTION 'only an administrator may process referral payouts';
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction % not found', p_transaction_id;
  END IF;
  IF v_tx.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'transaction % is not completed (status=%)', p_transaction_id, v_tx.status;
  END IF;
  IF v_tx.referral_payout_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'referral payouts for transaction % were already processed at %', p_transaction_id, v_tx.referral_payout_processed_at;
  END IF;
  IF v_tx.commission_amount_cents IS NULL THEN
    RAISE EXCEPTION 'transaction % has no commission_amount_cents captured yet - set the real commission before running payouts, do not guess one', p_transaction_id;
  END IF;

  v_dm_commission := v_tx.commission_amount_cents / 100.0;
  v_deal_amount   := COALESCE(v_tx.amount_cents, 0) / 100.0;

  v_tier := CASE
    WHEN v_dm_commission >= 50000 THEN 'full'
    WHEN v_dm_commission >= 5000  THEN 'flat'
    ELSE 'points_only'
  END;

  PERFORM set_config('app.trusted_role_grant', 'true', true);

  v_referee_id := v_tx.requester_id;
  v_current_id := v_tx.requester_id;
  v_seen := ARRAY[v_tx.requester_id];

  WHILE v_level <= 10 LOOP
    SELECT invited_by INTO v_referrer_id FROM public.profiles WHERE id = v_current_id;
    EXIT WHEN v_referrer_id IS NULL;
    EXIT WHEN v_referrer_id = ANY(v_seen); -- guards against a self-referral / circular invite loop
    v_seen := array_append(v_seen, v_referrer_id);

    IF v_level <= 3 AND v_tier <> 'points_only' THEN
      v_cash_amount := CASE
        WHEN v_tier = 'full' THEN ROUND(v_dm_commission * (CASE v_level WHEN 1 THEN 0.08 WHEN 2 THEN 0.04 WHEN 3 THEN 0.02 END))
        ELSE 500 -- flat tier
      END;

      IF v_cash_amount > 0 THEN
        INSERT INTO public.referral_transactions (
          referrer_id, referee_id, buyer_id, transaction_id, transaction_type,
          deal_amount, dm_commission, platform_fee, referral_level, payout_type,
          referral_earning, status
        ) VALUES (
          v_referrer_id, v_referee_id, v_tx.requester_id, v_tx.id::text, 'escrow',
          v_deal_amount, v_dm_commission, v_dm_commission, v_level, 'cash',
          v_cash_amount, 'pending'
        );

        INSERT INTO public.notifications (user_id, type, title, message, amount, link)
        VALUES (v_referrer_id, 'referral_cash', 'Referral bonus earned',
                'You earned a cash referral bonus from your network.', v_cash_amount, '/referrals');

        v_payouts_made := v_payouts_made + 1;
      END IF;
    ELSE
      v_points := CASE v_level
        WHEN 1 THEN 15 WHEN 2 THEN 10 WHEN 3 THEN 5
        WHEN 4 THEN 60 WHEN 5 THEN 40 WHEN 6 THEN 25
        WHEN 7 THEN 15 WHEN 8 THEN 10 WHEN 9 THEN 5
        WHEN 10 THEN 2 ELSE 2
      END;

      SELECT * INTO v_existing FROM public.loyalty_points WHERE user_id = v_referrer_id FOR UPDATE;
      IF FOUND THEN
        UPDATE public.loyalty_points
        SET points_balance = points_balance + v_points,
            points_lifetime = points_lifetime + v_points,
            updated_at = now()
        WHERE user_id = v_referrer_id;
      ELSE
        INSERT INTO public.loyalty_points (user_id, points_balance, points_lifetime)
        VALUES (v_referrer_id, v_points, v_points);
      END IF;

      INSERT INTO public.referral_transactions (
        referrer_id, referee_id, buyer_id, transaction_id, transaction_type,
        deal_amount, dm_commission, platform_fee, referral_level, payout_type,
        points_awarded, referral_earning, status
      ) VALUES (
        v_referrer_id, v_referee_id, v_tx.requester_id, v_tx.id::text, 'escrow',
        v_deal_amount, v_dm_commission, v_dm_commission, v_level, 'points',
        v_points, 0, 'confirmed'
      );

      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (v_referrer_id, 'referral_points', 'Loyalty points earned',
              'You earned loyalty points from your referral network.', '/referrals');

      v_payouts_made := v_payouts_made + 1;
    END IF;

    v_referee_id := v_referrer_id;
    v_current_id := v_referrer_id;
    v_level := v_level + 1;
  END LOOP;

  UPDATE public.transactions SET referral_payout_processed_at = now() WHERE id = p_transaction_id;

  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES ('referral_payouts_processed', jsonb_build_object('transaction_id', p_transaction_id, 'payouts_made', v_payouts_made), auth.uid());

  RETURN v_payouts_made;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_referral_payouts_for_transaction(BIGINT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Now that both write paths go through validated, server-side RPCs (which
-- run as the function owner and bypass RLS the same way every other
-- SECURITY DEFINER function in this project already does), remove the
-- client's ability to write to these two tables directly at all. Reading
-- your own records still works exactly as before.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner writes own loyalty points row" ON public.loyalty_points;
DROP POLICY IF EXISTS "Referrer-scoped referral transaction insert" ON public.referral_transactions;
