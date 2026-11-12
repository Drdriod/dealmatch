-- Audit F-006: two-step sign-in (MFA) was enforced only by the browser (MfaGate). Anyone with a
-- staff password could skip the screen and call the database directly with a password-only
-- session. The role helpers now also require the session to be MFA-verified (aal2), so every
-- policy and function that asks is_admin() / is_staff() / is_admin_staff() / is_superadmin()
-- is protected without touching them one by one.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
$$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'agent'))
$$;

CREATE OR REPLACE FUNCTION public.is_admin_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'agent', 'verifier'))
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
$$;
