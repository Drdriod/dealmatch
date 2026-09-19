-- ============================================================================
-- Server-side admin login lockout + logging.
--
-- AdminLoginPage.jsx's own comment already flags this: its attempt counter
-- lives in sessionStorage, which is not a real lockout - closing the tab or
-- opening a private window resets it to zero, and nothing is logged
-- anywhere an admin could review later. This adds a real one:
--   record_admin_login_attempt(email, success) - called after every attempt
--   is_admin_login_locked(email)                - checked before every attempt
-- Locks an email after 5 failed attempts inside a 15-minute window.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL,
  success    boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time
  ON public.admin_login_attempts (lower(email), created_at DESC);

ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- Nobody reads this table directly from the browser - only through
-- is_admin_login_locked() below (SECURITY DEFINER) or by staff via the
-- admin panel querying with an admin-checked RPC. No SELECT policy at all
-- means anon/authenticated get zero direct rows back.
DROP POLICY IF EXISTS "staff can view admin login attempts" ON public.admin_login_attempts;
CREATE POLICY "staff can view admin login attempts" ON public.admin_login_attempts
  FOR SELECT USING (public.is_admin_staff());

CREATE OR REPLACE FUNCTION public.record_admin_login_attempt(
  p_email   text,
  p_success boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_login_attempts (email, success)
  VALUES (lower(trim(p_email)), p_success);

  -- Keep the table small - only the lockout window plus a little slack
  -- for review ever needs to exist.
  DELETE FROM public.admin_login_attempts WHERE created_at < now() - interval '7 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_admin_login_attempt(text, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_login_locked(
  p_email text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_count int;
BEGIN
  SELECT count(*) INTO v_failed_count
  FROM public.admin_login_attempts
  WHERE lower(email) = lower(trim(p_email))
    AND success = false
    AND created_at > now() - interval '15 minutes';

  RETURN v_failed_count >= 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_login_locked(text) TO anon, authenticated;

COMMENT ON TABLE public.admin_login_attempts IS
  'Server-side log backing is_admin_login_locked()/record_admin_login_attempt(). '
  'Replaces the sessionStorage-only counter in AdminLoginPage.jsx, which reset '
  'on every new tab/browser and left no audit trail.';
