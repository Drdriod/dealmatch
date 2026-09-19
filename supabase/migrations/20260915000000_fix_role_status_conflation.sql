-- Fixes a real bug flagged during the trace: profiles.role was doing three
-- unrelated jobs at once (staff permission, a fixed marketplace persona,
-- and moderation status), and the moderation part was actively broken:
-- api/admin/[resource].js's `unsuspend` action did
--   role = (role === 'suspended' ? 'buyer' : role)
-- which permanently demotes a suspended admin/agent/verifier to 'buyer'
-- the moment they're unsuspended, silently destroying their real
-- permission role. account_status already exists for exactly this and was
-- just never used consistently.
--
-- This migration:
--   1. Moves 'suspended'/'deleted' out of role and into account_status,
--      where they actually belong - they're moderation status, not
--      identity, and account_status already existed for exactly this.
--   2. Backfills any row currently sitting in role='suspended'/'deleted'
--      into account_status accordingly, restoring role to 'buyer' as the
--      safe default (same floor the old unsuspend bug used, but now this
--      is a one-time backfill instead of firing on every unsuspend).
--   3. Re-affirms the role CHECK constraint with 'suspended'/'deleted'
--      removed - every other value that was already legal (including the
--      marketplace persona values buyer/seller/renter/landlord/investor/
--      student/professional, which OnboardingPage.jsx actively writes on
--      every onboarding completion) stays exactly as it was. This
--      migration only removes what account_status now covers; it does not
--      touch anything else about how role is used.

begin;

-- 1. Backfill: anyone currently marked role='suspended' gets that moved to
--    account_status, and role reset to 'buyer' as the safe default (this
--    matches the previous unsuspend behavior, but now it only ever
--    happens once, here, not every time someone is unsuspended).
update public.profiles
set account_status = 'suspended',
    role = 'buyer'
where role = 'suspended';

-- Anyone marked role='deleted' the same way.
update public.profiles
set account_status = 'deleted',
    role = 'buyer'
where role = 'deleted';

-- 2. Re-affirm the CHECK constraint with only 'suspended'/'deleted'
--    removed - matching the full live list from
--    20260904000002_roles_and_status_constraints.sql exactly, minus those
--    two. Every persona value OnboardingPage.jsx writes (including
--    'professional', its own onboarding path) stays legal.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array[
    'buyer','seller','renter','landlord','agent','investor','student',
    'professional','lender','verifier','admin','superadmin'
  ]));

-- 3. The 3-strikes agent auto-suspend trigger and the agent scorecard view
--    both independently depended on role='suspended' too - found only by
--    tracing every writer of that value, not just the client-side ones.
--    fn_process_complaint_resolution() (20260711000000, upheld-complaint
--    trigger) did `UPDATE profiles SET role = 'suspended'` directly at the
--    database level whenever an agent hit 3 upheld complaints - completely
--    independent of the admin panel, and would now hard-fail against the
--    narrowed... no, the RESTORED constraint above still allows every
--    persona value, so this trigger's UPDATE would keep working today.
--    But it has the exact same bug as the client-side unsuspend action:
--    it stomps whatever the agent's role was (always 'agent' in practice,
--    but still) instead of touching account_status, so it's fixed here
--    too rather than leaving a second copy of the same bug in place.
CREATE OR REPLACE FUNCTION public.fn_process_complaint_resolution() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  new_strikes integer;
BEGIN
  -- Only act when status changes TO 'upheld'
  IF NEW.status = 'upheld' AND OLD.status <> 'upheld' AND NEW.agent_id IS NOT NULL THEN

    UPDATE public.agent_scores
    SET
      complaints_upheld = complaints_upheld + 1,
      strike_count      = strike_count + 1,
      rating            = GREATEST(1.00, rating - 0.50),
      updated_at        = now()
    WHERE agent_id = NEW.agent_id
    RETURNING strike_count INTO new_strikes;

    -- 3 strikes -> auto-suspend
    IF new_strikes >= 3 THEN
      UPDATE public.agent_scores
      SET status = 'suspended', updated_at = now()
      WHERE agent_id = NEW.agent_id;

      -- FIX: account_status, not role - the agent keeps role='agent' and
      -- just gets suspended, instead of role being overwritten.
      UPDATE public.profiles
      SET account_status = 'suspended'
      WHERE id = NEW.agent_id;

      INSERT INTO public.admin_audit_log (action, metadata, performed_by)
      VALUES (
        'agent_auto_suspended',
        jsonb_build_object(
          'agent_id', NEW.agent_id,
          'strike_count', new_strikes,
          'triggered_by_complaint', NEW.id
        ),
        NEW.resolved_by
      );
    END IF;

    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES (
      'agent_strike_issued',
      jsonb_build_object(
        'agent_id', NEW.agent_id,
        'complaint_id', NEW.id,
        'strike_number', new_strikes
      ),
      NEW.resolved_by
    );
  END IF;

  RETURN NEW;
END;
$$;

-- v_agent_scorecard filtered on role IN ('agent','suspended') to include
-- agents who'd been auto-suspended (their role having been overwritten by
-- the bug above). With that bug fixed, a suspended agent's role stays
-- 'agent', so this simplifies to just filtering on role - no need to
-- special-case the old suspended-role value at all.
CREATE OR REPLACE VIEW public.v_agent_scorecard AS
 SELECT p.id,
    p.full_name,
    p.email,
    p.phone,
    s.total_verifications,
    s.verified_count,
    s.rejected_count,
    s.complaints_received,
    s.complaints_upheld,
    s.strike_count,
    s.rating,
    s.status,
    s.last_activity,
    round(
        CASE
            WHEN (s.total_verifications = 0) THEN (100)::numeric
            ELSE (((s.verified_count)::numeric / (s.total_verifications)::numeric) * (100)::numeric)
        END, 1) AS success_rate_pct,
    round(
        CASE
            WHEN (s.complaints_received = 0) THEN (0)::numeric
            ELSE (((s.complaints_upheld)::numeric / (s.complaints_received)::numeric) * (100)::numeric)
        END, 1) AS complaint_uphold_rate_pct,
    GREATEST(0, (3 - s.strike_count)) AS strikes_remaining
   FROM (public.profiles p
     JOIN public.agent_scores s ON ((s.agent_id = p.id)))
  WHERE (p.role = 'agent')
  ORDER BY s.rating DESC, s.total_verifications DESC;

commit;
