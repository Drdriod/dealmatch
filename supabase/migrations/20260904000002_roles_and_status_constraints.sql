-- ============================================================================
-- Support the new onboarding paths (Seeker / Place Provider / Skilled
-- Professional) and fix two status-vocabulary bugs found while wiring them up.
-- ============================================================================

-- 1. 'professional' is a brand-new role (skilled people onboarding path).
--    'lender' was already referenced by RLS policies and LenderDashboardPage
--    but was never actually a legal value here - anyone the app tried to
--    label a lender would have failed this constraint. Both are added now.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'buyer'::text, 'seller'::text, 'renter'::text, 'landlord'::text,
    'agent'::text, 'investor'::text, 'student'::text, 'professional'::text,
    'lender'::text, 'verifier'::text, 'admin'::text, 'superadmin'::text,
    'suspended'::text, 'deleted'::text
  ]));

-- 2. professional_applications.status only ever allowed pending/approved/
--    rejected, but the Admin dashboard's "Deactivate" action tried to write
--    'inactive' (not a legal value - the write would have failed) and several
--    read-side checks compared against 'active' (also never a legal value,
--    so those checks were always false). 'paused' is added as the correct
--    third state, mirroring the active/paused vocabulary already used by
--    properties and student_hostels.
ALTER TABLE public.professional_applications DROP CONSTRAINT IF EXISTS professional_applications_status_check;
ALTER TABLE public.professional_applications ADD CONSTRAINT professional_applications_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'paused'::text]));
