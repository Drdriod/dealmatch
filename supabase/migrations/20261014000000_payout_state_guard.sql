-- ============================================================================
-- Payout state guard (October 2026).
--
-- The allowed status moves for a payout_queue row are defined in
-- src/lib/payoutStates.js (PAYOUT_TRANSITIONS). This trigger enforces the same
-- table in the database, so no writer can skip it: the server cron, the
-- webhook, reconciliation, and the admin Payouts tab, which writes through
-- the browser client.
--
--   pending    -> processing, failed
--   processing -> paid, failed
--   paid       -> failed            (a reversal after payment)
--   failed     -> pending           (an admin retry)
--
-- Keep this list identical to PAYOUT_TRANSITIONS. A test in
-- src/lib/payoutStates.test.mjs checks the JS side.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_payout_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'pending'    AND NEW.status IN ('processing', 'failed'))
    OR (OLD.status = 'processing' AND NEW.status IN ('paid', 'failed'))
    OR (OLD.status = 'paid'       AND NEW.status = 'failed')
    OR (OLD.status = 'failed'     AND NEW.status = 'pending')
  ) THEN
    RAISE EXCEPTION 'A payout cannot move from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payout_transition ON public.payout_queue;
CREATE TRIGGER trg_guard_payout_transition
  BEFORE UPDATE OF status ON public.payout_queue
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_payout_transition();
