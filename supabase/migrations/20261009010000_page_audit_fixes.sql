-- Page audit fixes (October 2026). Companion to docs/audit/PAGES_AUDIT_2026-10.md
-- and docs/security/2026-10-database-audit.md. Idempotent; safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Public profile projection for visitor-facing pages.
--    profiles RLS only lets a user read their own row (or staff), so provider
--    cards, provider profiles and rental host badges were silently empty for
--    visitors. This view exposes ONLY non-sensitive display columns. It is
--    intentionally owner-run (no security_invoker) so it can bypass the
--    profiles RLS for these columns; do not add email, phone, dob, identity
--    or account-status columns to it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.city,
    p.state,
    p.bio,
    p.role,
    p.identity_verification_status
  FROM public.profiles p
  WHERE COALESCE(p.is_deactivated, false) = false;

REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Listing status vocabulary. The admin console writes paused / rejected /
--    pending_review / rented / inactive, which the original CHECK rejected, so
--    pausing or rejecting a property failed silently in the UI.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.properties') IS NOT NULL THEN
    ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_status_check;
    ALTER TABLE public.properties ADD CONSTRAINT properties_status_check
      CHECK (status = ANY (ARRAY[
        'active', 'pending', 'pending_review', 'paused', 'rejected',
        'inactive', 'rented', 'sold', 'removed'
      ]::text[]));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. mortgage_applications.updated_at: the admin status update writes it, and
--    the missing column made every mortgage status change fail.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.mortgage_applications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 4. process_referral_payouts_for_transaction: agents must not be able to
--    trigger payouts. Remove is_admin_staff() from the guard; keep admin and
--    superadmin only.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.process_referral_payouts_for_transaction'::regproc) INTO v_def;
  v_new := replace(
    v_def,
    'IF NOT (public.get_my_role() IN (''admin'', ''superadmin'') OR public.is_admin_staff()) THEN',
    'IF NOT (public.get_my_role() IN (''admin'', ''superadmin'') OR public.is_superadmin()) THEN'
  );
  IF v_new <> v_def THEN
    EXECUTE v_new;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Identity documents: agents must not be able to delete identity files.
--    Only admin, verifier and superadmin may delete from the identity-docs bucket.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff delete identity docs" ON storage.objects;
CREATE POLICY "Staff delete identity docs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'identity-docs'
    AND (
      public.get_my_role() IN ('admin', 'verifier', 'superadmin')
      OR public.is_superadmin()
    )
  );

COMMIT;
