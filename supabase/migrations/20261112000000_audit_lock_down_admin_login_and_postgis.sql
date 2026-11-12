-- Audit fixes F-004 and F-007.
-- F-004: anyone holding the public key could call record_admin_login_attempt and lock any admin
--   out. The admin sign-in now goes through /api/admin/login (Redis rate limits), so the browser
--   no longer needs either lockout function. Only the server (service role) may call them.
-- F-007: PostGIS reference tables sat in the public schema with RLS off and write rights for anon.
REVOKE EXECUTE ON FUNCTION public.record_admin_login_attempt(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_login_locked(text) FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM anon, authenticated;
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['geography_columns','geometry_columns'] LOOP
    IF to_regclass('public.'||v) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', v);
    END IF;
  END LOOP;
END $$;
