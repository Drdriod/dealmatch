-- 19. properties.status: allow 'under_verification'.
--
-- The verification flow moves a listing pending_review -> under_verification -> active or rejected.
-- Three places write or read that middle status:
--   * api/agent/[action].js, through agentVerificationRepository.markPropertyUnderVerification
--     (an agent starts a site visit),
--   * VerificationPage (STATUS_FLOW, the "In Progress" tab and the "assign agent" button),
--   * AgentDashboardPage (the "Assigned" tab lists pending_review and under_verification).
-- The CHECK from 20261009010000_page_audit_fixes.sql does not include it, so every one of those
-- writes is refused by the database and the verification flow cannot get past its first step.
--
-- Every other value in the constraint is kept. No existing row can violate the wider set.
-- Owner-side rules are unchanged: fn_guard_property_client_write still stops a seller from
-- setting any status except removed (or re-listing a listing staff had approved).
--
-- The migration tool cancels DROP statements. Run this file in the SQL editor, as for 14 and 15.

DO $$
BEGIN
  IF to_regclass('public.properties') IS NULL THEN
    RAISE EXCEPTION 'public.properties does not exist';
  END IF;

  ALTER TABLE public.properties
    DROP CONSTRAINT IF EXISTS properties_status_check,
    ADD CONSTRAINT properties_status_check
      CHECK (status = ANY (ARRAY[
        'active', 'pending', 'pending_review', 'under_verification', 'paused', 'rejected',
        'inactive', 'rented', 'sold', 'removed'
      ]::text[]));

  -- Check the result: the new value is accepted by the constraint and nothing was lost.
  IF pg_get_constraintdef((SELECT oid FROM pg_constraint
        WHERE conrelid = 'public.properties'::regclass AND conname = 'properties_status_check'))
     NOT LIKE '%under_verification%' THEN
    RAISE EXCEPTION 'properties_status_check does not allow under_verification';
  END IF;
END $$;
