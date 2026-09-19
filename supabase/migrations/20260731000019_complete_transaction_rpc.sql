-- ============================================================================
-- Requester-confirms-complete step (FUNDED -> COMPLETED). This is the
-- "Providers are paid only after you confirm the job is done" moment
-- shown in the escrow notice on JobPostingPage.
--
-- Does NOT set commission_rate_applied / commission_amount_cents here.
-- Architecture v3 Section 4.3 is explicit that the commission rate is a
-- separate business decision still pending -- inventing a number now
-- would be worse than leaving it null. Once a rate exists, set it here
-- via a follow-up migration (or an admin action before this RPC runs).
-- The immutability trigger from 20260731000014 still protects whatever
-- value eventually gets set, once the transaction is COMPLETED.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_transaction(
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
    RAISE EXCEPTION 'only the requester may mark this transaction complete';
  END IF;
  IF v_tx.status <> 'FUNDED' THEN
    RAISE EXCEPTION 'transaction % is not funded (status=%) -- cannot complete an unfunded transaction', p_transaction_id, v_tx.status;
  END IF;

  UPDATE public.transactions
  SET status = 'COMPLETED', completed_at = now(), updated_at = now()
  WHERE id = p_transaction_id
  RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_transaction(BIGINT) TO authenticated;
