-- ============================================================================
-- Prerequisite for wiring escrow.funded into the Paystack webhook.
--
-- The webhook's existing escrow_payment case deliberately does NOT trust
-- metadata.user_id / metadata.platform_fee (that was the exact bug already
-- fixed once) -- it resolves the real row by payment_ref, a value written
-- server-side (well, RPC-side, authorization-checked) before payment ever
-- starts, then trusts only that row's own columns.
--
-- transactions had no equivalent column. Adding it here, plus the RPC that
-- writes it under the same authorization check as accept_bid/counter_bid
-- (20260731000017): only the requester of a PENDING transaction can bind
-- a payment reference to it, and only once per still-pending transaction.
-- ============================================================================

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_payment_ref
  ON public.transactions(payment_ref) WHERE payment_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.start_escrow_payment(
  p_transaction_id BIGINT,
  p_reference TEXT
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
    RAISE EXCEPTION 'only the requester may start payment on this transaction';
  END IF;
  IF v_tx.status <> 'PENDING' THEN
    RAISE EXCEPTION 'transaction % is not awaiting payment (status=%)', p_transaction_id, v_tx.status;
  END IF;
  IF v_tx.amount_cents IS NULL OR v_tx.amount_cents <= 0 THEN
    RAISE EXCEPTION 'transaction % has no valid amount to pay', p_transaction_id;
  END IF;

  UPDATE public.transactions
  SET payment_ref = p_reference, updated_at = now()
  WHERE id = p_transaction_id
  RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_escrow_payment(BIGINT, TEXT) TO authenticated;
