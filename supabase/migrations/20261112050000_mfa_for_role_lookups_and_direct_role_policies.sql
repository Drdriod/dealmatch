-- Audit F-006 (completion). The first fix made is_admin() / is_staff() / is_admin_staff() /
-- is_superadmin() require an MFA-verified session (aal2). Two other routes to the same powers
-- were still open to a password-only session:
--   1. get_my_role(), used by 33 policies and 5 functions, returned 'admin' etc. without
--      looking at the session level.
--   2. 13 policies looked the role up in profiles directly.
-- Both now require aal2 for staff roles. Ordinary users and lenders are unaffected.

-- Staff-type roles get a role that matches nothing until the second factor is done.
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
           WHEN role IN ('admin', 'superadmin', 'agent', 'verifier', 'senior_agent', 'regional_coordinator')
                AND COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2'
             THEN 'mfa_required'
           ELSE role
         END
  FROM public.profiles WHERE id = auth.uid()
$$;

-- True when the caller holds one of these roles AND the session passed the second factor.
CREATE OR REPLACE FUNCTION public.has_mfa_role(p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ANY (p_roles))
$$;
REVOKE EXECUTE ON FUNCTION public.has_mfa_role(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_mfa_role(text[]) TO anon, authenticated, service_role;

-- Rewrite the 13 direct-role policies (only the role test changes; each keeps its other conditions).
CREATE OR REPLACE FUNCTION pg_temp.set_using(p_schema text, p_table text, p_policy text, p_using text) RETURNS void
LANGUAGE plpgsql AS $f$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = p_schema AND tablename = p_table AND policyname = p_policy) THEN
    EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p_policy, p_schema, p_table, p_using);
  END IF;
END $f$;

SELECT pg_temp.set_using('public', 'agent_accounts', 'Admins manage agents', $$public.has_mfa_role(ARRAY['admin'])$$);
SELECT pg_temp.set_using('public', 'bank_details', 'Staff can view bank details',
  $$is_superadmin() OR public.has_mfa_role(ARRAY['admin','agent','senior_agent','regional_coordinator'])$$);
SELECT pg_temp.set_using('public', 'crypto_payments', 'Admins read all crypto',
  $$((SELECT auth.uid()) = user_id) OR public.has_mfa_role(ARRAY['admin'])$$);
SELECT pg_temp.set_using('public', 'escrow_transactions', 'Admins read all escrow',
  $$((SELECT auth.uid()) = tenant_id) OR public.has_mfa_role(ARRAY['admin'])$$);
SELECT pg_temp.set_using('public', 'escrow_transactions', 'Admins update escrow', $$public.has_mfa_role(ARRAY['admin'])$$);
SELECT pg_temp.set_using('public', 'hostel_enquiries', 'Owner reads own hostel enquiries',
  $$((SELECT auth.uid()) = student_id)
    OR EXISTS (SELECT 1 FROM student_hostels h WHERE h.id = hostel_enquiries.hostel_id AND h.owner_id = (SELECT auth.uid()))
    OR public.has_mfa_role(ARRAY['admin'])$$);
SELECT pg_temp.set_using('public', 'hostel_payments', 'Owner reads own hostel payments',
  $$((SELECT auth.uid()) = owner_id) OR public.has_mfa_role(ARRAY['admin'])$$);
SELECT pg_temp.set_using('storage', 'objects', 'Owner reads own identity docs',
  $$bucket_id = 'identity-docs'
    AND (((SELECT auth.uid())::text = (storage.foldername(name))[1]) OR public.has_mfa_role(ARRAY['admin','agent']))$$);
SELECT pg_temp.set_using('public', 'payments', 'Admins read all payments', $$public.has_mfa_role(ARRAY['admin'])$$);
SELECT pg_temp.set_using('public', 'professional_applications', 'Admins manage professionals',
  $$((SELECT auth.uid()) = user_id) OR public.has_mfa_role(ARRAY['admin'])$$);
SELECT pg_temp.set_using('public', 'property_interest', 'Sellers see interests on own properties',
  $$EXISTS (SELECT 1 FROM properties WHERE properties.id = property_interest.property_id AND properties.seller_id = (SELECT auth.uid()))
    OR public.has_mfa_role(ARRAY['admin','agent'])$$);
SELECT pg_temp.set_using('public', 'student_verifications', 'Admin read all verifications', $$public.has_mfa_role(ARRAY['admin','verifier'])$$);
SELECT pg_temp.set_using('public', 'student_verifications', 'Admin update verifications', $$public.has_mfa_role(ARRAY['admin','verifier'])$$);
