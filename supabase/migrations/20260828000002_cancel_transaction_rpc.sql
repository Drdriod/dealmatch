-- ============================================================================
-- Job cancel/close workflow (checklist item 7 / report F-06 follow-on).
--
-- The assessment's synthetic test job could be created and viewed but had
-- no supported way to close it: no owner-facing cancel control and no admin
-- pipeline action. This adds a single, narrowly scoped RPC that:
--
--   * Only the requester or an admin/superadmin may call it.
--   * Only works while the job is OPEN or PENDING, i.e. before any escrow
--     money has actually moved. Once a transaction reaches FUNDED, closing
--     it is a refund decision, not a plain cancel, and must go through the
--     existing dispute/escrow-release path instead - this RPC intentionally
--     refuses to touch a FUNDED transaction so it can never be used to
--     bypass that.
--   * Is idempotent-safe: cancelling an already-CANCELLED/COMPLETED
--     transaction raises a clear error rather than silently no-op'ing or
--     double-processing anything.
--   * Records who cancelled it and why, using the same admin_audit_log
--     trigger path added in 20260828000001, so cancellations are
--     attributable and reviewable per checklist item 15.
-- ============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.cancel_transaction(
  p_transaction_id BIGINT,
  p_reason TEXT DEFAULT NULL
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_is_requester BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction % not found', p_transaction_id;
  END IF;

  v_is_requester := (v_tx.requester_id = auth.uid());
  v_is_admin := public.get_my_role() IN ('admin', 'superadmin') OR public.is_admin_staff();

  IF NOT (v_is_requester OR v_is_admin) THEN
    RAISE EXCEPTION 'only the requester or an administrator may cancel this job';
  END IF;

  IF v_tx.status NOT IN ('OPEN', 'PENDING') THEN
    RAISE EXCEPTION 'transaction % cannot be cancelled directly (status=%). Funded jobs must go through the dispute/refund flow.', p_transaction_id, v_tx.status;
  END IF;

  UPDATE public.transactions
  SET status = 'CANCELLED',
      cancelled_by = auth.uid(),
      cancel_reason = NULLIF(TRIM(COALESCE(p_reason, '')), ''),
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_transaction_id
  RETURNING * INTO v_tx;

  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES (
    CASE WHEN v_is_requester THEN 'job_cancelled_by_requester' ELSE 'job_cancelled_by_admin' END,
    jsonb_build_object('transaction_id', v_tx.id, 'reason', v_tx.cancel_reason),
    auth.uid()
  );

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_transaction(BIGINT, TEXT) TO authenticated;
