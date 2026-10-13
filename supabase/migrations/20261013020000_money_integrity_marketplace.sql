-- ============================================================================
-- Money integrity, part 2 (October 2026): marketplace jobs and money to return.
--
--   1. A client can no longer create a job that already carries a commission,
--      a provider, a payout account or a payment reference. Those are set only
--      by accept_bid (commission and payout account locked at acceptance) and
--      start_escrow_payment (the payment reference). A job a client inserts is
--      always OPEN with those fields empty.
--   2. payment_refunds: money DealMatch holds and must return. Written by the
--      webhook when a transfer is more than the price (overpaid) or less than
--      it (underpaid). Staff return the money by bank transfer and mark it
--      refunded here. Admin-only.
-- ============================================================================

-- 1. Marketplace jobs: force the safe starting state on client inserts --------
CREATE OR REPLACE FUNCTION public.fn_guard_transaction_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fn_payment_bypass() THEN
    RETURN NEW;
  END IF;
  NEW.status                     := 'OPEN';
  NEW.commission_id              := NULL;
  NEW.commission_rate_applied    := NULL;
  NEW.commission_amount_cents    := NULL;
  NEW.provider_payout_account_id := NULL;
  NEW.payment_ref                := NULL;
  NEW.payout_status              := 'not_queued';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_transaction_insert ON public.transactions;
CREATE TRIGGER trg_guard_transaction_insert
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_transaction_insert();

-- 2. Money to return -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id              BIGSERIAL PRIMARY KEY,
  reference       TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('overpaid', 'underpaid')),
  payer_email     TEXT,
  profile_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_kobo     BIGINT NOT NULL CHECK (amount_kobo > 0),
  status          TEXT NOT NULL DEFAULT 'to_refund'
                  CHECK (status IN ('to_refund', 'refunded', 'resolved')),
  note            TEXT,
  bank_reference  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  refunded_at     TIMESTAMPTZ,
  refunded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dedupe_key      TEXT NOT NULL UNIQUE  -- one row per charge (overpaid) or per short payment (underpaid)
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON public.payment_refunds (status, created_at);

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.payment_refunds TO authenticated;

DROP POLICY IF EXISTS payment_refunds_admin_read ON public.payment_refunds;
CREATE POLICY payment_refunds_admin_read ON public.payment_refunds
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS payment_refunds_admin_update ON public.payment_refunds;
CREATE POLICY payment_refunds_admin_update ON public.payment_refunds
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Only the server records money to return. Staff mark it returned through
-- mark_payment_refunded, which records who did it and the bank reference.
CREATE OR REPLACE FUNCTION public.mark_payment_refunded(
  p_id             BIGINT,
  p_bank_reference TEXT
)
RETURNS public.payment_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_refunds%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can record a refund';
  END IF;
  IF p_bank_reference IS NULL OR btrim(p_bank_reference) = '' THEN
    RAISE EXCEPTION 'A bank reference for the transfer is required';
  END IF;

  UPDATE public.payment_refunds
     SET status = 'refunded', bank_reference = btrim(p_bank_reference),
         refunded_at = now(), refunded_by = auth.uid(), updated_at = now()
   WHERE id = p_id AND status = 'to_refund'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % is not waiting to be returned', p_id;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payment_refunded(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_payment_refunded(BIGINT, TEXT) TO authenticated;
