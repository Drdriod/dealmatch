-- fixes-v2.sql
-- Referenced by src/pages/Admin/AdminPage.jsx ("Permission denied - run
-- fixes-v2.sql in Supabase" / "See db/fixes-v2.sql for trigger definition").
-- That file never existed in the repository, which is why the Mortgage and
-- Student Hostels admin pages failed to load (F-07, checklist item 9) and
-- why admin_audit_log writes silently did nothing (checklist item 15/17).
--
-- Safe to run more than once: every statement is idempotent (DROP ... IF
-- EXISTS before CREATE, GRANT is naturally idempotent).
--
-- This file is also copied into supabase/migrations/ with a timestamped
-- name so it applies automatically through the normal migration pipeline.
-- Run this one by hand only if you manage schema changes outside that
-- pipeline.

-- ============================================================================
-- 1) Make sure the base table grants exist. RLS policies only ever narrow
--    access that a role already has at the GRANT level - if a table was
--    created outside the project's default-privilege setup, Postgres
--    returns 42501 (permission denied) before RLS is even evaluated, which
--    matches exactly what the admin UI was catching and reporting.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mortgage_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_hostels        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hostel_payments        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hostel_enquiries       TO authenticated;
GRANT SELECT                          ON public.mortgage_applications TO anon;
GRANT SELECT                          ON public.student_hostels        TO anon;

-- ============================================================================
-- 2) Pin search_path on the SECURITY DEFINER role-check helpers. Without
--    this, Postgres flags them as "Function Search Path Mutable" and, in
--    rare cases, a caller-controlled search_path can make a SECURITY
--    DEFINER function resolve an unexpected object. Both helpers are used
--    directly inside the mortgage/hostel RLS policies below.
-- ============================================================================

ALTER FUNCTION public.get_my_role()     SET search_path = public;
ALTER FUNCTION public.is_admin_staff()  SET search_path = public;

-- ============================================================================
-- 3) mortgage_applications: drop every policy that has accumulated on this
--    table across earlier migrations and replace them with one clear set.
--    The old set had five overlapping policies (some FOR SELECT, one bare
--    USING with no FOR clause, mismatched role lists) which made this table
--    unusually hard to reason about compared to the equivalent, working
--    student_verifications policies. Consolidating removes that ambiguity
--    even though it wasn't provably the cause of the 42501 on its own.
-- ============================================================================

DROP POLICY IF EXISTS "Admins read mortgage apps"            ON public.mortgage_applications;
DROP POLICY IF EXISTS "Anyone can submit mortgage app"        ON public.mortgage_applications;
DROP POLICY IF EXISTS "Lenders can update mortgage applications" ON public.mortgage_applications;
DROP POLICY IF EXISTS "Lenders can view all mortgage applications" ON public.mortgage_applications;
DROP POLICY IF EXISTS "Mortgage insert"                       ON public.mortgage_applications;
DROP POLICY IF EXISTS "Mortgage select"                       ON public.mortgage_applications;
DROP POLICY IF EXISTS "Mortgage update"                       ON public.mortgage_applications;
DROP POLICY IF EXISTS "Staff reads mortgage applications"     ON public.mortgage_applications;
DROP POLICY IF EXISTS "Users manage own applications"         ON public.mortgage_applications;

CREATE POLICY "mortgage_select" ON public.mortgage_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'superadmin', 'lender', 'verifier')
    OR public.is_admin_staff()
  );

CREATE POLICY "mortgage_insert" ON public.mortgage_applications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "mortgage_update" ON public.mortgage_applications
  FOR UPDATE USING (
    public.get_my_role() IN ('admin', 'superadmin', 'lender')
    OR public.is_admin_staff()
  ) WITH CHECK (
    public.get_my_role() IN ('admin', 'superadmin', 'lender')
    OR public.is_admin_staff()
  );

-- ============================================================================
-- 4) student_hostels: same consolidation. Owner keeps full control of their
--    own listing; admin/staff can moderate any listing; the public can only
--    see listings that have already gone active.
-- ============================================================================

DROP POLICY IF EXISTS "Admin manage all hostels" ON public.student_hostels;
DROP POLICY IF EXISTS "Owner insert hostel"       ON public.student_hostels;
DROP POLICY IF EXISTS "Owner update hostel"       ON public.student_hostels;
DROP POLICY IF EXISTS "Public read active hostels" ON public.student_hostels;

CREATE POLICY "hostels_select" ON public.student_hostels
  FOR SELECT USING (
    status = 'active'
    OR owner_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'superadmin')
    OR public.is_admin_staff()
  );

CREATE POLICY "hostels_insert" ON public.student_hostels
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

CREATE POLICY "hostels_update" ON public.student_hostels
  FOR UPDATE USING (
    owner_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'superadmin')
    OR public.is_admin_staff()
  ) WITH CHECK (
    owner_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'superadmin')
    OR public.is_admin_staff()
  );

-- ============================================================================
-- 5) Give mortgage_applications and student_hostels the same trigger-based
--    audit trail that properties/profiles already get from
--    fn_audit_admin_action(), so admin status changes on these two tables
--    are actually recorded instead of relying on the no-op auditLog() stub
--    in AdminPage.jsx.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_audit_mortgage_status ON public.mortgage_applications;
CREATE TRIGGER trg_audit_mortgage_status
  AFTER UPDATE OF status ON public.mortgage_applications
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.fn_audit_admin_action('mortgage_status_changed');

DROP TRIGGER IF EXISTS trg_audit_hostel_status ON public.student_hostels;
CREATE TRIGGER trg_audit_hostel_status
  AFTER UPDATE OF status ON public.student_hostels
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.fn_audit_admin_action('hostel_status_changed');

-- ============================================================================
-- 6) fn_audit_admin_action() only reads NEW.status for the 'properties' and
--    'profiles' tables (see the CASE in the baseline schema); extend it so
--    the two new triggers above actually capture the new status instead of
--    logging NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_admin_action() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES (
    TG_ARGV[0],
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'record_id', NEW.id,
      'new_status', CASE TG_TABLE_NAME
        WHEN 'properties'             THEN NEW.status
        WHEN 'profiles'               THEN NEW.identity_verification_status
        WHEN 'mortgage_applications'  THEN NEW.status
        WHEN 'student_hostels'        THEN NEW.status
        ELSE NULL
      END
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 7) admin_audit_log currently accepts an INSERT from any authenticated
--    user ("Anyone insert audit log" - auth.uid() IS NOT NULL). That
--    defeats the point of an audit trail: any signed-in user could write
--    forged entries. All real writes go through fn_audit_admin_action(),
--    which is SECURITY DEFINER and therefore bypasses RLS regardless of
--    this policy, so tightening it does not break the audit triggers.
-- ============================================================================

DROP POLICY IF EXISTS "Anyone insert audit log" ON public.admin_audit_log;

CREATE POLICY "service_role_insert_audit_log" ON public.admin_audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
