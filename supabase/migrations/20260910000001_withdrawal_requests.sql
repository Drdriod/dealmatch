-- ============================================================================
-- Withdrawal requests: the provider-initiated half of moving money out of
-- the wallet, built to work now even though release_held_payment() (see
-- 20260909000004) is still a stub. Nothing here waits on Paystack/Korapay
-- confirming the hold/release mechanism, because it does not need to:
--
--   - request_withdrawal() only ever draws against commission_wallet_ledger 'released'
--     rows, never 'held' ones. Until the gateway release call is wired in,
--     released stays at zero for every provider, so this simply cannot be
--     called successfully yet -- the balance check does that gating for
--     free, no separate feature flag needed.
--   - Once 'released' rows start arriving, this flow is already live: a
--     provider requests a payout, an admin marks it paid (manually, via
--     bank transfer, until a direct gateway payout call exists), and
--     fulfill_withdrawal_request() writes the matching 'withdrawn' ledger
--     row that WalletPage.jsx already knows how to render.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'paid', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id                 BIGSERIAL PRIMARY KEY,
  profile_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents       BIGINT NOT NULL CHECK (amount_cents > 0),
  payout_account_id  UUID REFERENCES public.payout_accounts(id),
  status             public.withdrawal_status NOT NULL DEFAULT 'pending',
  gateway_ref        TEXT,
  notes              TEXT,
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at        TIMESTAMPTZ,
  reviewed_by        UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_profile ON public.withdrawal_requests(profile_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_pending ON public.withdrawal_requests(status) WHERE status = 'pending';

COMMENT ON TABLE public.withdrawal_requests IS
  'Provider payout requests against their released wallet balance. status '
  'stays pending until an admin fulfills or rejects it, see '
  'fulfill_withdrawal_request() and reject_withdrawal_request() below. '
  'This table records intent; the actual money movement is still manual '
  '(bank transfer) until a direct gateway payout call is confirmed.';

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS withdrawal_requests_select_own ON public.withdrawal_requests;
CREATE POLICY withdrawal_requests_select_own ON public.withdrawal_requests
  FOR SELECT USING (auth.uid() = profile_id OR public.is_admin());

-- No direct INSERT/UPDATE policy for regular users on purpose: creation and
-- every status change go through the SECURITY DEFINER functions below, so
-- the balance check and admin gate can never be bypassed by writing the
-- table directly.
DROP POLICY IF EXISTS withdrawal_requests_admin_write ON public.withdrawal_requests;
CREATE POLICY withdrawal_requests_admin_write ON public.withdrawal_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── available_wallet_balance(profile_id): shared by the RPC and can be
--    called from the client for a live check before showing the button ────
CREATE OR REPLACE FUNCTION public.available_wallet_balance(p_profile_id UUID)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(amount_cents) FROM public.commission_wallet_ledger
              WHERE profile_id = p_profile_id AND entry_type = 'released'), 0)
    - COALESCE((SELECT SUM(amount_cents) FROM public.commission_wallet_ledger
                WHERE profile_id = p_profile_id AND entry_type = 'withdrawn'), 0)
    - COALESCE((SELECT SUM(amount_cents) FROM public.withdrawal_requests
                WHERE profile_id = p_profile_id AND status = 'pending'), 0);
$$;

GRANT EXECUTE ON FUNCTION public.available_wallet_balance(UUID) TO authenticated;

-- ── request_withdrawal(): provider-initiated, checked against the real
--    balance server-side, never the number the client happens to show ────
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount_cents BIGINT)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available BIGINT;
  v_payout    public.payout_accounts%ROWTYPE;
  v_req       public.withdrawal_requests%ROWTYPE;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'withdrawal amount must be greater than zero';
  END IF;

  SELECT * INTO v_payout FROM public.payout_accounts
    WHERE profile_id = auth.uid() AND status = 'verified'
    ORDER BY verified_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no verified payout account on file, add one before requesting a withdrawal';
  END IF;

  v_available := public.available_wallet_balance(auth.uid());
  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'requested amount (%) exceeds available balance (%)', p_amount_cents, v_available;
  END IF;

  INSERT INTO public.withdrawal_requests (profile_id, amount_cents, payout_account_id)
  VALUES (auth.uid(), p_amount_cents, v_payout.id)
  RETURNING * INTO v_req;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    auth.uid(),
    'withdrawal_requested',
    'Withdrawal requested',
    'Your request for NGN ' || to_char(p_amount_cents / 100.0, 'FM999,999,999.00') || ' is being reviewed.',
    '/wallet'
  );

  RETURN v_req;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(BIGINT) TO authenticated;

-- ── fulfill_withdrawal_request() / reject_withdrawal_request(): admin-only,
--    mirroring the is_admin() gate used everywhere else in this schema ────
CREATE OR REPLACE FUNCTION public.fulfill_withdrawal_request(p_request_id BIGINT, p_gateway_ref TEXT DEFAULT NULL)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.withdrawal_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin may fulfill a withdrawal request';
  END IF;

  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'withdrawal request % is not pending (status=%)', p_request_id, v_req.status;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'paid', gateway_ref = p_gateway_ref, reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_request_id
  RETURNING * INTO v_req;

  INSERT INTO public.commission_wallet_ledger (profile_id, entry_type, amount_cents, gateway_ref)
  VALUES (v_req.profile_id, 'withdrawn', v_req.amount_cents, p_gateway_ref);

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    v_req.profile_id,
    'withdrawal_paid',
    'Withdrawal paid',
    'Your withdrawal of NGN ' || to_char(v_req.amount_cents / 100.0, 'FM999,999,999.00') || ' has been paid out.',
    '/wallet'
  );

  RETURN v_req;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_withdrawal_request(p_request_id BIGINT, p_notes TEXT DEFAULT NULL)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.withdrawal_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin may reject a withdrawal request';
  END IF;

  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'withdrawal request % is not pending (status=%)', p_request_id, v_req.status;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'rejected', notes = p_notes, reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_request_id
  RETURNING * INTO v_req;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    v_req.profile_id,
    'withdrawal_rejected',
    'Withdrawal request declined',
    COALESCE(p_notes, 'Your withdrawal request was declined. Contact support for details.'),
    '/wallet'
  );

  RETURN v_req;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fulfill_withdrawal_request(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal_request(BIGINT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fulfill_withdrawal_request(BIGINT, TEXT) IS
  'Admin-only despite the authenticated grant -- is_admin() is checked '
  'inside the function body, matching the pattern used by every other '
  'admin RPC in this schema rather than relying on a role-level grant.';
