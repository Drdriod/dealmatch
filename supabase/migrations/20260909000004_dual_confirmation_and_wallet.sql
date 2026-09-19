-- ============================================================================
-- Phase 2: dual confirmation + commission lock at deal creation + wallet
-- ledger. This supersedes two things stated in earlier migrations:
--
-- 1. ADR-009's comment that commission fields are "captured once at
--    settlement" is now wrong on purpose. Per an explicit business
--    decision, the rate locks the moment a deal is created (accept_bid,
--    when provider + amount are fixed), not at completion. The
--    immutability trigger below is rewritten to match: once
--    commission_rate_applied is first set, it can never change, at any
--    status, not just after COMPLETED.
--
-- 2. complete_transaction() (single-sided, requester-only) is replaced by
--    two functions, confirm_transaction_buyer and confirm_transaction_
--    provider. The transaction only reaches COMPLETED once both have
--    confirmed, closing the gap where only the paying side had a say in
--    whether a job was actually done.
--
-- The actual gateway hold/release call (Paystack/Korapay side) is
-- deliberately NOT wired into confirm_transaction_provider below, it's
-- a stub, see the comment on release_held_payment(). That call depends
-- on confirming the exact hold/settlement mechanism with both gateways
-- directly, still pending as of this migration.
-- ============================================================================

-- ── 1. New columns on transactions ─────────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_confirmed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commission_id              BIGINT REFERENCES public.commissions(id),
  ADD COLUMN IF NOT EXISTS provider_payout_account_id UUID REFERENCES public.payout_accounts(id);

COMMENT ON COLUMN public.transactions.commission_id IS
  'Which commissions row was active at accept_bid time, snapshotted '
  'alongside commission_rate_applied/commission_amount_cents. Kept for '
  'traceability, the numeric columns are what actually govern the deal, '
  'not a live join back to commissions.';

COMMENT ON COLUMN public.transactions.provider_payout_account_id IS
  'Which payout_accounts row was verified at accept_bid time. Locked the '
  'same way the commission rate is, so a provider changing banks mid-deal '
  'cannot redirect a deal already in progress.';

-- ── 2. Rewrite the immutability trigger to lock on first-set, not on '
--    COMPLETED specifically -----------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_commission_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.commission_rate_applied IS NOT NULL AND (
    NEW.commission_rate_applied IS DISTINCT FROM OLD.commission_rate_applied
    OR NEW.commission_amount_cents IS DISTINCT FROM OLD.commission_amount_cents
  ) THEN
    RAISE EXCEPTION 'commission fields are immutable once locked in at deal creation (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. accept_bid now locks the commission rate and the payout account ────
CREATE OR REPLACE FUNCTION public.accept_bid(
  p_transaction_id BIGINT,
  p_bid_id BIGINT
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx     public.transactions%ROWTYPE;
  v_bid    public.bids%ROWTYPE;
  v_comm   RECORD;
  v_payout public.payout_accounts%ROWTYPE;
  v_rate   NUMERIC(5,4);
  v_fee    BIGINT := 0;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction % not found', p_transaction_id;
  END IF;
  IF v_tx.requester_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the requester may accept a bid on this transaction';
  END IF;
  IF v_tx.status <> 'OPEN' THEN
    RAISE EXCEPTION 'transaction % is not open (status=%)', p_transaction_id, v_tx.status;
  END IF;

  SELECT * INTO v_bid FROM public.bids WHERE id = p_bid_id AND transaction_id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bid % not found on transaction %', p_bid_id, p_transaction_id;
  END IF;
  IF v_bid.status <> 'PENDING' THEN
    RAISE EXCEPTION 'bid % is not pending (status=%)', p_bid_id, v_bid.status;
  END IF;

  -- Gate: a provider with nowhere for money to land shouldn't have a bid
  -- accepted. Mirrors the client-side check in JobPostingPage.acceptBid,
  -- enforced here too since the client check alone is not a security
  -- boundary.
  SELECT * INTO v_payout FROM public.payout_accounts
    WHERE profile_id = v_bid.provider_id AND status = 'verified'
    ORDER BY verified_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'provider % has no verified payout account yet', v_bid.provider_id;
  END IF;

  UPDATE public.bids SET status = 'ACCEPTED' WHERE id = p_bid_id;
  UPDATE public.bids SET status = 'DECLINED'
    WHERE transaction_id = p_transaction_id AND id <> p_bid_id AND status = 'PENDING';

  -- Lock the commission rate NOW, this is "deal/invoice creation" for the
  -- purposes of the rate-lock rule, even though payment may happen later.
  SELECT * INTO v_comm FROM public.get_active_commission(v_tx.category_id);
  IF v_comm.commission_id IS NOT NULL THEN
    v_rate := ROUND(v_comm.percentage_rate / 100, 4);
    v_fee  := COALESCE(v_comm.fixed_fee_cents, 0);
  END IF;
  -- If nothing is configured yet, v_rate stays NULL, honoring the
  -- existing rule from ADR-009: never invent a number nobody approved.

  UPDATE public.transactions
  SET provider_id                = v_bid.provider_id,
      amount_cents               = v_bid.amount_cents,
      status                     = 'PENDING',
      commission_id              = v_comm.commission_id,
      commission_rate_applied    = v_rate,
      commission_amount_cents    = CASE WHEN v_rate IS NULL THEN NULL
                                        ELSE ROUND(v_bid.amount_cents * v_rate) + v_fee END,
      provider_payout_account_id = v_payout.id,
      updated_at                 = now()
  WHERE id = p_transaction_id
  RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_bid(BIGINT, BIGINT) TO authenticated;

-- ── 4. Dual confirmation, replacing complete_transaction() ────────────────
CREATE OR REPLACE FUNCTION public.confirm_transaction_buyer(
  p_transaction_id BIGINT
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction % not found', p_transaction_id;
  END IF;
  IF v_tx.requester_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the requester may confirm this transaction';
  END IF;
  IF v_tx.status <> 'FUNDED' THEN
    RAISE EXCEPTION 'transaction % is not funded (status=%)', p_transaction_id, v_tx.status;
  END IF;

  UPDATE public.transactions
  SET buyer_confirmed_at = COALESCE(buyer_confirmed_at, now()),
      status = CASE WHEN provider_confirmed_at IS NOT NULL THEN 'COMPLETED' ELSE status END,
      completed_at = CASE WHEN provider_confirmed_at IS NOT NULL THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_transaction_id
  RETURNING * INTO v_tx;

  IF v_tx.status = 'COMPLETED' THEN
    PERFORM public.release_held_payment(v_tx.id);
  END IF;

  RETURN v_tx;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_transaction_provider(
  p_transaction_id BIGINT
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction % not found', p_transaction_id;
  END IF;
  IF v_tx.provider_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the provider may confirm this transaction';
  END IF;
  IF v_tx.status <> 'FUNDED' THEN
    RAISE EXCEPTION 'transaction % is not funded (status=%)', p_transaction_id, v_tx.status;
  END IF;

  UPDATE public.transactions
  SET provider_confirmed_at = COALESCE(provider_confirmed_at, now()),
      status = CASE WHEN buyer_confirmed_at IS NOT NULL THEN 'COMPLETED' ELSE status END,
      completed_at = CASE WHEN buyer_confirmed_at IS NOT NULL THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_transaction_id
  RETURNING * INTO v_tx;

  IF v_tx.status = 'COMPLETED' THEN
    PERFORM public.release_held_payment(v_tx.id);
  END IF;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_transaction_buyer(BIGINT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_transaction_provider(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.confirm_transaction_buyer(BIGINT) IS
  'Requester-side half of dual confirmation. Only flips the transaction '
  'to COMPLETED once the provider has also confirmed, see '
  'confirm_transaction_provider. Replaces the old single-sided '
  'complete_transaction(), which is dropped below.';

DROP FUNCTION IF EXISTS public.complete_transaction(BIGINT);

-- ── 5. Wallet ledger, mirrors gateway state, is not custody itself ────────
-- Every row here is either a read of what the gateway reports (held/
-- released) or a record of DealMatch's own transfer call, it is not a
-- balance DealMatch is holding, see release_held_payment() below.
DO $$ BEGIN
  CREATE TYPE public.commission_wallet_entry_type AS ENUM ('held', 'released', 'withdrawn', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.commission_wallet_ledger (
  id             BIGSERIAL PRIMARY KEY,
  profile_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id BIGINT REFERENCES public.transactions(id),
  entry_type     public.commission_wallet_entry_type NOT NULL,
  amount_cents   BIGINT NOT NULL,
  gateway        public.payout_gateway,
  gateway_ref    TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wallet dashboard groups by month, this index is what makes that a range
-- scan instead of a full-table sort.
CREATE INDEX IF NOT EXISTS idx_commission_wallet_ledger_profile_occurred
  ON public.commission_wallet_ledger(profile_id, occurred_at DESC);

COMMENT ON TABLE public.commission_wallet_ledger IS
  'Money-in/money-out history for a provider''s dashboard, mirroring '
  'gateway-reported state. "held" and "released" entries reflect what '
  'Paystack/Korapay report about a subaccount, "withdrawn" reflects a '
  'confirmed settlement to the provider''s bank. This table is a mirror '
  'for display, not a balance DealMatch controls.';

ALTER TABLE public.commission_wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_wallet_ledger_select_own ON public.commission_wallet_ledger;
CREATE POLICY commission_wallet_ledger_select_own ON public.commission_wallet_ledger
  FOR SELECT USING (auth.uid() = profile_id OR public.is_admin());

DROP POLICY IF EXISTS commission_wallet_ledger_admin_write ON public.commission_wallet_ledger;
CREATE POLICY commission_wallet_ledger_admin_write ON public.commission_wallet_ledger
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 6. release_held_payment(): STUB ────────────────────────────────────────
-- Fires the moment both sides confirm. This is where the actual gateway
-- call belongs (tell Paystack/Korapay to release the held split to the
-- provider's subaccount). NOT implemented here, deliberately, since the
-- exact hold/release mechanism has not been confirmed in writing with
-- either gateway yet. What this stub does do: write the
-- commission_wallet_ledger 'held' entry so the dashboard has something
-- honest to show ("confirmed, release pending") rather than nothing.
-- Once the gateway call is confirmed and built, this function is where it
-- gets wired in, and it should insert a 'released' entry on success.
CREATE OR REPLACE FUNCTION public.release_held_payment(p_transaction_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND OR v_tx.provider_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.commission_wallet_ledger (profile_id, transaction_id, entry_type, amount_cents)
  VALUES (
    v_tx.provider_id,
    v_tx.id,
    'held',
    COALESCE(v_tx.amount_cents, 0) - COALESCE(v_tx.commission_amount_cents, 0)
  );

  -- TODO Phase 2b: call the confirmed gateway release endpoint here, then
  -- INSERT a 'released' commission_wallet_ledger row on success.
END;
$$;
