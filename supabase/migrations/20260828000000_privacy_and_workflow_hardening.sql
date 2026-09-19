-- Privacy and workflow hardening - August 2026
-- Forward-only migration. Do not edit already-applied migrations.

-- The frontend no longer calls check_email_exists. Remove anonymous and
-- authenticated execution so the RPC cannot be used as an account-enumeration
-- oracle through the public Supabase client key.
REVOKE EXECUTE ON FUNCTION public.check_email_exists(text) FROM anon, authenticated;

-- Keep the function available only for controlled server-side maintenance or a
-- future generic signup flow. The function must never be exposed to browsers.
COMMENT ON FUNCTION public.check_email_exists(text) IS
  'Restricted internal helper. Do not grant anon/authenticated execute; exact account existence must not be disclosed to callers.';

-- Make public profile-image delivery explicit and keep sensitive uploads out of
-- the public avatar bucket. Identity documents, selfies, payout evidence, and
-- private attachments must use separate private buckets and signed URLs.
-- This migration intentionally does not change existing avatar object URLs.
-- Bucket and object policies for private verification storage should be applied
-- by the deployment that owns those buckets.
