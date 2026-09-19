-- ============================================================================
-- payout_accounts: numbered 20260909000002, BEFORE commissions (000003) and
-- dual_confirmation_and_wallet (000004), not after -- this is not a style
-- choice. 20260909000004 does:
--   ALTER TABLE public.transactions
--     ADD COLUMN provider_payout_account_id UUID REFERENCES public.payout_accounts(id);
--   ...
--   gateway public.payout_gateway   -- column type on commission_wallet_ledger
-- Both a REFERENCES clause and a column's enum type are checked at
-- CREATE/ALTER TABLE time, not deferred like a function body -- so this
-- table and the payout_gateway enum have to exist before 000004 runs, or
-- that migration fails outright the moment anyone applies this batch.
-- This migration and 000003 (commissions) applied cleanly and are live.
-- 000004 was reissued once already (see commission_wallet_ledger naming
-- in that file's header, it collided with a pre-existing wallet_ledger
-- table from the escrow system) -- this file did not need to change for
-- that fix, it's unaffected.
--
-- Three already-written pieces depend on what this migration creates:
--   - accept_bid() (000004) requires a verified row before letting a
--     requester accept a bid at all
--   - commission_wallet_ledger.gateway (000004) types against
--     payout_gateway, defined below
--   - request_withdrawal() (20260910000001) requires a verified row before
--     accepting a withdrawal request
-- and JobPostingPage.jsx already calls a has_verified_payout_account() RPC
-- that this migration is what defines.
--
-- "verified" here means admin-reviewed, same shape as identity_verification
-- and IdentityTab elsewhere in this schema -- there is no gateway API call
-- confirming the bank details on submission, because (same caveat as
-- release_held_payment) the exact Paystack/Korapay verification mechanism
-- hasn't been confirmed yet. An admin approves against what the provider
-- typed in, until that's wired in.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.payout_gateway AS ENUM ('paystack', 'korapay');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_account_status AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.payout_accounts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway                public.payout_gateway NOT NULL DEFAULT 'paystack',
  bank_name              TEXT NOT NULL,
  account_number         TEXT NOT NULL,
  account_name           TEXT NOT NULL,
  status                 public.payout_account_status NOT NULL DEFAULT 'pending',
  gateway_recipient_code TEXT, -- filled in once a real Paystack/Korapay recipient call exists
  rejected_reason        TEXT,
  verified_at            TIMESTAMPTZ,
  reviewed_by            UUID REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_accounts_profile ON public.payout_accounts(profile_id, verified_at DESC);

COMMENT ON TABLE public.payout_accounts IS
  'Provider bank details for payouts. accept_bid() and request_withdrawal() '
  'both require a status=verified row here before proceeding. Verification '
  'is manual (admin review) until a confirmed gateway recipient-verification '
  'call replaces it -- see gateway_recipient_code.';

DROP TRIGGER IF EXISTS trg_payout_accounts_updated_at ON public.payout_accounts;
CREATE TRIGGER trg_payout_accounts_updated_at
  BEFORE UPDATE ON public.payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_accounts_select_own ON public.payout_accounts;
CREATE POLICY payout_accounts_select_own ON public.payout_accounts
  FOR SELECT USING (auth.uid() = profile_id OR public.is_admin());

-- No direct INSERT/UPDATE policy: submission and every status change go
-- through the SECURITY DEFINER functions below, same reasoning as
-- withdrawal_requests -- a provider cannot self-verify by writing the row.
DROP POLICY IF EXISTS payout_accounts_admin_write ON public.payout_accounts;
CREATE POLICY payout_accounts_admin_write ON public.payout_accounts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── has_verified_payout_account(): the exact RPC JobPostingPage.jsx
--    already calls before letting a requester accept a bid ─────────────────
CREATE OR REPLACE FUNCTION public.has_verified_payout_account(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payout_accounts
    WHERE profile_id = p_profile_id AND status = 'verified'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_verified_payout_account(UUID) TO authenticated;

-- ── submit_payout_account(): provider-initiated, always lands as pending.
--    A second submission while one is already pending/verified replaces
--    the pending one rather than creating duplicates; a verified account
--    can be replaced too (e.g. changed banks), which drops back to pending
--    and re-requires admin review -- accept_bid()/request_withdrawal() will
--    correctly see no verified row until that review happens. ─────────────
CREATE OR REPLACE FUNCTION public.submit_payout_account(
  p_bank_name TEXT,
  p_account_number TEXT,
  p_account_name TEXT,
  p_gateway public.payout_gateway DEFAULT 'paystack'
) RETURNS public.payout_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payout_accounts%ROWTYPE;
BEGIN
  IF COALESCE(TRIM(p_bank_name), '') = '' OR COALESCE(TRIM(p_account_number), '') = '' OR COALESCE(TRIM(p_account_name), '') = '' THEN
    RAISE EXCEPTION 'bank name, account number and account name are all required';
  END IF;

  DELETE FROM public.payout_accounts WHERE profile_id = auth.uid() AND status = 'pending';

  INSERT INTO public.payout_accounts (profile_id, gateway, bank_name, account_number, account_name, status)
  VALUES (auth.uid(), p_gateway, TRIM(p_bank_name), TRIM(p_account_number), TRIM(p_account_name), 'pending')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payout_account(TEXT, TEXT, TEXT, public.payout_gateway) TO authenticated;

-- ── verify_payout_account() / reject_payout_account(): admin-only ─────────
CREATE OR REPLACE FUNCTION public.verify_payout_account(p_id UUID)
RETURNS public.payout_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payout_accounts%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin may verify a payout account';
  END IF;

  UPDATE public.payout_accounts
  SET status = 'verified', verified_at = now(), reviewed_by = auth.uid(), rejected_reason = NULL
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout account % not found', p_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (v_row.profile_id, 'payout_account_verified', 'Payout account verified',
          'Your bank details have been verified. You can now accept paid jobs and request withdrawals.', '/wallet');

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_payout_account(p_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS public.payout_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payout_accounts%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin may reject a payout account';
  END IF;

  UPDATE public.payout_accounts
  SET status = 'rejected', rejected_reason = p_reason, reviewed_by = auth.uid()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout account % not found', p_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (v_row.profile_id, 'payout_account_rejected', 'Payout account needs changes',
          COALESCE(p_reason, 'Your submitted bank details could not be verified. Please check and resubmit.'), '/payout-setup');

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_payout_account(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payout_account(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.verify_payout_account(UUID) IS
  'Admin-only despite the authenticated grant -- is_admin() is checked '
  'inside the body, matching the pattern used by every other admin RPC '
  'in this schema (fulfill_withdrawal_request, reject_withdrawal_request, etc).';
