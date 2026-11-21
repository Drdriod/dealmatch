-- Referral programme v2: three cash levels, credits instead of cash-redeemable points,
-- guardrails, hold-then-release, reversal, and every rate editable from the admin panel.
-- Replaces the 10-level points ladder (no live referral data existed when this shipped).

-- ── 1. Settings (single source of rates) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_settings (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  unit        text NOT NULL DEFAULT 'number' CHECK (unit IN ('percent', 'naira', 'days', 'months', 'count', 'credits', 'flag')),
  value       numeric(12,2) NOT NULL CHECK (value >= 0),
  sort_order  int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.referral_settings (key, label, description, unit, value, sort_order) VALUES
  ('program_enabled',      'Programme switched on', '1 = rewards are earned, 0 = no new rewards (existing ones still release).', 'flag', 1, 10),
  ('l1_pct',               'Level 1 share (Starter)', 'Share of DealMatch commission (before VAT) paid to the person who invited the payer.', 'percent', 8, 20),
  ('l2_pct',               'Level 2 share', 'Share paid to the person who invited the level 1 referrer.', 'percent', 4, 30),
  ('l3_pct',               'Level 3 share', 'Share paid to the person who invited the level 2 referrer.', 'percent', 2, 40),
  ('builder_l1_pct',       'Level 1 share (Builder)', 'Level 1 share once the referrer has enough active referrals.', 'percent', 10, 50),
  ('champion_l1_pct',      'Level 1 share (Champion)', 'Level 1 share for top referrers.', 'percent', 12, 60),
  ('builder_min_active',   'Builder needs active referrals', 'Active = referred person with a paid deal in the last 90 days.', 'count', 5, 70),
  ('champion_min_active',  'Champion needs active referrals', 'Active = referred person with a paid deal in the last 90 days.', 'count', 20, 80),
  ('founding_slots',       'Founding Ambassador places', 'First people to earn a reward get the founding rate.', 'count', 50, 90),
  ('founding_l1_pct',      'Level 1 share (Founding)', 'Level 1 share for Founding Ambassadors during their founding months.', 'percent', 12, 100),
  ('founding_months',      'Founding rate lasts', 'Months the founding rate applies from the first reward.', 'months', 6, 110),
  ('max_share_pct',        'Most DealMatch pays out per deal', 'All levels together never exceed this share of the commission.', 'percent', 18, 120),
  ('min_payout_naira',     'Smallest cash reward', 'A reward below this is not paid in cash.', 'naira', 200, 130),
  ('hold_days',            'Hold before release', 'Days a reward waits (dispute window) before it reaches the wallet.', 'days', 10, 140),
  ('monthly_cap_naira',    'Monthly cap per referrer', 'Rewards above this in a calendar month wait for admin review.', 'naira', 50000, 150),
  ('small_deal_naira',     'Small deal threshold', 'Commission below this pays an unlock credit instead of cash.', 'naira', 5000, 160),
  ('small_deal_credits',   'Credits on a small deal', 'Unlock credits paid to the level 1 referrer on a small deal.', 'credits', 1, 170),
  ('activation_credits',   'Activation bonus credits', 'Unlock credits to BOTH people when the referred person gets identity-verified.', 'credits', 2, 180),
  ('attribution_months',   'Referral lasts', 'Months after sign-up during which the referred person earns rewards.', 'months', 12, 190),
  ('subscription_months',  'Subscription rewards last', 'Months of recurring rewards on a referred professional subscription.', 'months', 12, 200)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads referral settings" ON public.referral_settings;
CREATE POLICY "Anyone reads referral settings" ON public.referral_settings FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.referral_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.referral_setting_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL,
  old_value  numeric(12,2),
  new_value  numeric(12,2) NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_setting_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read referral history" ON public.referral_setting_history;
CREATE POLICY "Admins read referral history" ON public.referral_setting_history FOR SELECT USING (public.is_admin() OR public.is_superadmin());

CREATE OR REPLACE FUNCTION public.ref_setting(p_key text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$ SELECT COALESCE((SELECT value FROM public.referral_settings WHERE key = p_key), 0) $$;
GRANT EXECUTE ON FUNCTION public.ref_setting(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_referral_setting(p_key text, p_value numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old numeric; v_unit text;
BEGIN
  IF NOT (public.is_admin() OR public.is_superadmin()) THEN
    RAISE EXCEPTION 'only an administrator can change referral settings' USING ERRCODE = '42501';
  END IF;
  SELECT value, unit INTO v_old, v_unit FROM public.referral_settings WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown referral setting %', p_key; END IF;
  IF p_value IS NULL OR p_value < 0 THEN RAISE EXCEPTION 'value cannot be negative'; END IF;
  IF v_unit = 'percent' AND p_value > 100 THEN RAISE EXCEPTION 'a percentage cannot exceed 100'; END IF;
  IF v_unit = 'flag' AND p_value NOT IN (0, 1) THEN RAISE EXCEPTION 'flag must be 0 or 1'; END IF;
  UPDATE public.referral_settings SET value = round(p_value, 2), updated_at = now(), updated_by = auth.uid() WHERE key = p_key;
  INSERT INTO public.referral_setting_history (key, old_value, new_value, changed_by) VALUES (p_key, v_old, round(p_value, 2), auth.uid());
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES ('referral_setting_changed', jsonb_build_object('key', p_key, 'old', v_old, 'new', round(p_value, 2)), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.admin_set_referral_setting(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_referral_setting(text, numeric) TO authenticated;

-- ── 2. Table changes ────────────────────────────────────────────────────────
ALTER TABLE public.referral_transactions
  ADD COLUMN IF NOT EXISTS wht_rate     numeric(5,2),
  ADD COLUMN IF NOT EXISTS wht_amount   numeric(14,2),
  ADD COLUMN IF NOT EXISTS net_amount   numeric(14,2),
  ADD COLUMN IF NOT EXISTS eligible_at  timestamptz,
  ADD COLUMN IF NOT EXISTS released_at  timestamptz,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_reason text;
CREATE INDEX IF NOT EXISTS referral_txn_release_idx ON public.referral_transactions (status, eligible_at) WHERE payout_type = 'cash';

-- Tighten the policy that let agents manage every referral row.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referral_transactions' AND cmd = 'ALL' LOOP
    EXECUTE format('DROP POLICY %I ON public.referral_transactions', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Admins manage referrals" ON public.referral_transactions FOR ALL
  USING (public.is_admin() OR public.is_superadmin()) WITH CHECK (public.is_admin() OR public.is_superadmin());

-- Credits: bonus entries, one per reason.
ALTER TABLE public.unlock_credit_ledger DROP CONSTRAINT IF EXISTS unlock_credit_ledger_entry_type_check;
ALTER TABLE public.unlock_credit_ledger ADD CONSTRAINT unlock_credit_ledger_entry_type_check
  CHECK (entry_type = ANY (ARRAY['purchased'::text, 'spent'::text, 'refunded'::text, 'bonus'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS unlock_credit_bonus_once ON public.unlock_credit_ledger (payment_ref) WHERE entry_type = 'bonus';

-- Founding Ambassadors
CREATE TABLE IF NOT EXISTS public.referral_founding (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  until      timestamptz NOT NULL
);
ALTER TABLE public.referral_founding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own founding row" ON public.referral_founding;
CREATE POLICY "Own founding row" ON public.referral_founding FOR SELECT USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.referral_founding FROM anon, authenticated;

-- Wallet: clawbacks of already-released rewards reduce the balance.
CREATE OR REPLACE FUNCTION public.available_wallet_balance(p_profile_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF p_profile_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN
    COALESCE((SELECT SUM(amount_cents) FROM public.commission_wallet_ledger
              WHERE profile_id = p_profile_id AND entry_type = 'released'), 0)
    - COALESCE((SELECT SUM(amount_cents) FROM public.commission_wallet_ledger
                WHERE profile_id = p_profile_id AND entry_type IN ('withdrawn', 'reversed')), 0)
    - COALESCE((SELECT SUM(amount_cents) FROM public.withdrawal_requests
                WHERE profile_id = p_profile_id AND status = 'pending'), 0);
END;
$function$;

-- ── 3. Engine ───────────────────────────────────────────────────────────────
-- Records the rewards for one captured payment. Server only.
-- p_commission_naira is DealMatch's commission BEFORE VAT. p_party_ids are the people in the deal.
CREATE OR REPLACE FUNCTION public.record_referral_rewards(
  p_payment_id text, p_referee_id uuid, p_transaction_type text,
  p_commission_naira numeric, p_deal_amount numeric DEFAULT 0, p_party_ids uuid[] DEFAULT '{}'
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ref       public.profiles%ROWTYPE;
  v_cur       uuid;
  v_referrer  uuid;
  v_level     int := 1;
  v_seen      uuid[] := ARRAY[p_referee_id];
  v_made      int := 0;
  v_rates     numeric[] := ARRAY[0, 0, 0];
  v_ids       uuid[] := ARRAY[NULL, NULL, NULL]::uuid[];
  v_sum       numeric;
  v_scale     numeric := 1;
  v_pct       numeric;
  v_amt       numeric;
  v_active    int;
  v_founding  public.referral_founding%ROWTYPE;
  v_month_tot numeric;
  v_first     timestamptz;
  v_hold      numeric := public.ref_setting('hold_days');
  v_min       numeric := public.ref_setting('min_payout_naira');
  v_credit_id text;
BEGIN
  IF public.ref_setting('program_enabled') < 1 THEN RETURN 0; END IF;
  IF p_transaction_type NOT IN ('property_sale', 'rental', 'hotel', 'escrow', 'subscription') THEN RETURN 0; END IF;
  IF p_commission_naira IS NULL OR p_commission_naira <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_ref FROM public.profiles WHERE id = p_referee_id;
  IF NOT FOUND OR v_ref.invited_by IS NULL THEN RETURN 0; END IF;
  -- The referred person must be identity-verified before anyone earns from them.
  IF v_ref.identity_verification_status IS DISTINCT FROM 'approved' THEN RETURN 0; END IF;
  -- Attribution window
  IF v_ref.created_at + make_interval(months => public.ref_setting('attribution_months')::int) < now() THEN RETURN 0; END IF;
  -- Recurring subscription rewards stop after the configured months.
  IF p_transaction_type = 'subscription' THEN
    SELECT min(created_at) INTO v_first FROM public.referral_transactions
     WHERE referee_id = p_referee_id AND transaction_type = 'subscription' AND payout_type IN ('cash', 'points') AND status <> 'cancelled';
    IF v_first IS NOT NULL AND v_first + make_interval(months => public.ref_setting('subscription_months')::int) < now() THEN RETURN 0; END IF;
  END IF;

  -- Small deals: one unlock credit to level 1, no cash.
  IF p_commission_naira < public.ref_setting('small_deal_naira') THEN
    v_referrer := v_ref.invited_by;
    IF v_referrer = ANY (p_party_ids) OR v_referrer = p_referee_id THEN RETURN 0; END IF;
    v_credit_id := 'smalldeal:' || p_payment_id || ':' || v_referrer;
    INSERT INTO public.unlock_credit_ledger (profile_id, entry_type, credits, payment_ref)
    VALUES (v_referrer, 'bonus', GREATEST(public.ref_setting('small_deal_credits')::int, 1), v_credit_id)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.referral_transactions (referrer_id, referee_id, payment_id, transaction_type, deal_amount, platform_fee, dm_commission,
        referral_rate, referral_earning, status, payout_type, referral_level, points_awarded, confirmed_at)
      VALUES (v_referrer, p_referee_id, p_payment_id, p_transaction_type, COALESCE(p_deal_amount, 0), p_commission_naira, p_commission_naira,
        0, 0, 'confirmed', 'points', 1, GREATEST(public.ref_setting('small_deal_credits')::int, 1), now())
      ON CONFLICT DO NOTHING;
      v_made := 1;
    END IF;
    RETURN v_made;
  END IF;

  -- Walk up the chain (max 3 levels), working out each level's rate.
  v_cur := p_referee_id;
  WHILE v_level <= 3 LOOP
    SELECT invited_by INTO v_referrer FROM public.profiles WHERE id = v_cur;
    EXIT WHEN v_referrer IS NULL OR v_referrer = ANY (v_seen);
    v_seen := v_seen || v_referrer;
    IF NOT (v_referrer = ANY (p_party_ids)) THEN  -- no reward when the referrer is in the deal
      IF v_level = 1 THEN
        SELECT count(DISTINCT referee_id) INTO v_active FROM public.referral_transactions
         WHERE referrer_id = v_referrer AND referral_level = 1 AND status <> 'cancelled'
           AND created_at > now() - interval '90 days';
        v_pct := public.ref_setting('l1_pct');
        IF v_active >= public.ref_setting('champion_min_active') THEN v_pct := GREATEST(v_pct, public.ref_setting('champion_l1_pct'));
        ELSIF v_active >= public.ref_setting('builder_min_active') THEN v_pct := GREATEST(v_pct, public.ref_setting('builder_l1_pct')); END IF;
        SELECT * INTO v_founding FROM public.referral_founding WHERE user_id = v_referrer;
        IF NOT FOUND AND (SELECT count(*) FROM public.referral_founding) < public.ref_setting('founding_slots') THEN
          INSERT INTO public.referral_founding (user_id, until)
          VALUES (v_referrer, now() + make_interval(months => public.ref_setting('founding_months')::int))
          ON CONFLICT DO NOTHING;
          SELECT * INTO v_founding FROM public.referral_founding WHERE user_id = v_referrer;
        END IF;
        IF v_founding.user_id IS NOT NULL AND v_founding.until > now() THEN v_pct := GREATEST(v_pct, public.ref_setting('founding_l1_pct')); END IF;
      ELSIF v_level = 2 THEN v_pct := public.ref_setting('l2_pct');
      ELSE v_pct := public.ref_setting('l3_pct'); END IF;
      v_rates[v_level] := v_pct;
      v_ids[v_level] := v_referrer;
    END IF;
    v_cur := v_referrer;
    v_level := v_level + 1;
  END LOOP;

  -- Cap the total share of the commission.
  v_sum := v_rates[1] + v_rates[2] + v_rates[3];
  IF v_sum > public.ref_setting('max_share_pct') AND v_sum > 0 THEN v_scale := public.ref_setting('max_share_pct') / v_sum; END IF;

  FOR v_level IN 1..3 LOOP
    CONTINUE WHEN v_ids[v_level] IS NULL OR v_rates[v_level] <= 0;
    v_amt := round(p_commission_naira * v_rates[v_level] * v_scale / 100, 2);
    CONTINUE WHEN v_amt < v_min;
    SELECT COALESCE(sum(referral_earning), 0) INTO v_month_tot FROM public.referral_transactions
     WHERE referrer_id = v_ids[v_level] AND payout_type = 'cash' AND status <> 'cancelled'
       AND created_at >= date_trunc('month', now());
    INSERT INTO public.referral_transactions (referrer_id, referee_id, payment_id, transaction_type, deal_amount, platform_fee, dm_commission,
      referral_rate, referral_earning, status, payout_type, referral_level, eligible_at, needs_review)
    VALUES (v_ids[v_level], p_referee_id, p_payment_id, p_transaction_type, COALESCE(p_deal_amount, 0), p_commission_naira, p_commission_naira,
      round(v_rates[v_level] * v_scale, 2), v_amt, 'pending', 'cash', v_level, now() + make_interval(days => v_hold::int),
      (v_month_tot + v_amt) > public.ref_setting('monthly_cap_naira'))
    ON CONFLICT DO NOTHING;
    IF FOUND THEN v_made := v_made + 1; END IF;
  END LOOP;
  RETURN v_made;
END $$;
REVOKE ALL ON FUNCTION public.record_referral_rewards(text, uuid, text, numeric, numeric, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_referral_rewards(text, uuid, text, numeric, numeric, uuid[]) TO service_role;

-- Cancel rewards for a refunded or disputed payment; claw back any already released.
CREATE OR REPLACE FUNCTION public.reverse_referral_rewards(p_payment_id text, p_reason text DEFAULT 'refund')
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.referral_transactions
            WHERE payment_id = p_payment_id AND payout_type = 'cash' AND status IN ('pending', 'confirmed') FOR UPDATE LOOP
    IF r.status = 'confirmed' AND r.released_at IS NOT NULL THEN
      INSERT INTO public.commission_wallet_ledger (profile_id, entry_type, amount_cents, gateway_ref)
      VALUES (r.referrer_id, 'reversed', round(COALESCE(r.net_amount, r.referral_earning) * 100)::bigint, 'referral-reversal:' || r.id);
      UPDATE public.tax_ledger SET status = 'reversed', note = COALESCE(note, '') || ' reversed: ' || p_reason
       WHERE reference = 'referral:' || r.id AND kind = 'wht' AND status = 'owed';
    END IF;
    UPDATE public.referral_transactions SET status = 'cancelled', cancel_reason = p_reason WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reverse_referral_rewards(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_referral_rewards(text, text) TO service_role;

-- Release rewards whose hold has ended. Withholding tax is taken here.
CREATE OR REPLACE FUNCTION public._release_referral_rows(p_only_user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record; n int := 0; v_rate numeric; v_wht numeric; v_net numeric;
BEGIN
  FOR r IN
    SELECT t.* FROM public.referral_transactions t
     WHERE t.payout_type = 'cash' AND t.status = 'pending' AND t.needs_review = false
       AND t.eligible_at IS NOT NULL AND t.eligible_at <= now()
       AND (p_only_user IS NULL OR t.referrer_id = p_only_user)
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.referrer_id AND p.identity_verification_status = 'approved')
       AND EXISTS (SELECT 1 FROM public.payout_accounts a WHERE a.profile_id = t.referrer_id AND a.status = 'verified')
     ORDER BY t.created_at FOR UPDATE OF t SKIP LOCKED
  LOOP
    v_rate := public.get_tax_rate('wht_referral');
    v_wht := round(r.referral_earning * v_rate / 100, 2);
    v_net := r.referral_earning - v_wht;
    UPDATE public.referral_transactions
       SET status = 'confirmed', released_at = now(), confirmed_at = now(), wht_rate = v_rate, wht_amount = v_wht, net_amount = v_net
     WHERE id = r.id;
    INSERT INTO public.commission_wallet_ledger (profile_id, entry_type, amount_cents, gateway_ref)
    VALUES (r.referrer_id, 'released', round(v_net * 100)::bigint, 'referral:' || r.id);
    IF v_wht > 0 THEN
      INSERT INTO public.tax_ledger (reference, kind, purpose, base_kobo, rate_pct, tax_kobo, profile_id)
      VALUES ('referral:' || r.id, 'wht', 'referral_payout', round(r.referral_earning * 100)::bigint, v_rate, round(v_wht * 100)::bigint, r.referrer_id)
      ON CONFLICT DO NOTHING;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public._release_referral_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._release_referral_rows(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_due_referral_rewards()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT public._release_referral_rows(NULL) $$;
REVOKE ALL ON FUNCTION public.release_due_referral_rewards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_due_referral_rewards() TO service_role;

-- A signed-in person releases only their own rewards (called when they open the referral page).
CREATE OR REPLACE FUNCTION public.release_my_referral_rewards()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  RETURN public._release_referral_rows(auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.release_my_referral_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_my_referral_rewards() TO authenticated;

-- Admin decision on a reward held for review.
CREATE OR REPLACE FUNCTION public.admin_review_referral(p_id uuid, p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_superadmin()) THEN RAISE EXCEPTION 'only an administrator' USING ERRCODE = '42501'; END IF;
  IF p_approve THEN
    UPDATE public.referral_transactions SET needs_review = false WHERE id = p_id AND status = 'pending';
  ELSE
    UPDATE public.referral_transactions SET status = 'cancelled', cancel_reason = 'rejected in review' WHERE id = p_id AND status = 'pending';
  END IF;
  INSERT INTO public.admin_audit_log (action, metadata, performed_by) VALUES ('referral_reviewed', jsonb_build_object('id', p_id, 'approved', p_approve), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.admin_review_referral(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_referral(uuid, boolean) TO authenticated;

-- ── 4. Activation bonus when the referred person is identity-verified ───────
CREATE OR REPLACE FUNCTION public.grant_referral_activation_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_credits int := GREATEST(public.ref_setting('activation_credits')::int, 0);
BEGIN
  IF NEW.identity_verification_status = 'approved' AND OLD.identity_verification_status IS DISTINCT FROM 'approved'
     AND NEW.invited_by IS NOT NULL AND NEW.invited_by <> NEW.id AND v_credits > 0 AND public.ref_setting('program_enabled') >= 1 THEN
    INSERT INTO public.unlock_credit_ledger (profile_id, entry_type, credits, payment_ref)
    VALUES (NEW.id, 'bonus', v_credits, 'activation:' || NEW.id || ':referee') ON CONFLICT DO NOTHING;
    INSERT INTO public.unlock_credit_ledger (profile_id, entry_type, credits, payment_ref)
    VALUES (NEW.invited_by, 'bonus', v_credits, 'activation:' || NEW.id || ':referrer') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.grant_referral_activation_bonus() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_referral_activation_bonus ON public.profiles;
CREATE TRIGGER trg_referral_activation_bonus AFTER UPDATE OF identity_verification_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.grant_referral_activation_bonus();

-- ── 5. Retire the old engines ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(p_points integer)
RETURNS TABLE(new_balance integer, cash_value numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RAISE EXCEPTION 'Points redemption has been replaced by unlock credits'; END $$;

CREATE OR REPLACE FUNCTION public.process_referral_payouts_for_transaction(p_transaction_id bigint)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_tx public.transactions%ROWTYPE; v_n integer;
BEGIN
  IF NOT (public.get_my_role() IN ('admin', 'superadmin') OR public.is_superadmin()) THEN
    RAISE EXCEPTION 'only an administrator may process referral payouts';
  END IF;
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction % not found', p_transaction_id; END IF;
  IF v_tx.status <> 'COMPLETED' THEN RAISE EXCEPTION 'transaction % is not completed (status=%)', p_transaction_id, v_tx.status; END IF;
  IF v_tx.referral_payout_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'referral payouts for transaction % were already processed at %', p_transaction_id, v_tx.referral_payout_processed_at;
  END IF;
  IF v_tx.commission_amount_cents IS NULL THEN
    RAISE EXCEPTION 'transaction % has no commission_amount_cents captured yet - set the real commission before running payouts, do not guess one', p_transaction_id;
  END IF;
  v_n := public.record_referral_rewards('tx:' || p_transaction_id, v_tx.requester_id, 'escrow',
           v_tx.commission_amount_cents / 100.0, v_tx.amount_cents / 100.0,
           ARRAY[v_tx.requester_id, v_tx.provider_id]::uuid[]);
  UPDATE public.transactions SET referral_payout_processed_at = now() WHERE id = p_transaction_id;
  RETURN v_n;
END $$;
