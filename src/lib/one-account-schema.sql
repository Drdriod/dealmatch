-- ─────────────────────────────────────────────────────────────
-- DealMatch: One Account Per Person Enforcement
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Add device fingerprint and account status columns to profiles
-- These are the only new columns we need - everything else already exists
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS account_flagged    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_reason     text,
  ADD COLUMN IF NOT EXISTS account_status     text    DEFAULT 'active';

-- Unique phone constraint - blocks duplicate signups with different emails
-- Skip if already exists to avoid error on re-run
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_phone'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT unique_phone UNIQUE (phone);
  END IF;
END $$;

-- Function: check if phone already exists (called at signup)
CREATE OR REPLACE FUNCTION check_phone_exists(p_phone text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = p_phone
  );
$$;

-- Function: check if email already exists
CREATE OR REPLACE FUNCTION check_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;

-- Function: check username
CREATE OR REPLACE FUNCTION check_username_exists(p_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(p_username)
  );
$$;

-- Function: check device fingerprint for duplicate detection
-- Returns count of existing accounts on that device
CREATE OR REPLACE FUNCTION check_device_exists(p_fingerprint text)
RETURNS TABLE(exists_count int, existing_email text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::int, MIN(p.email)
  FROM public.profiles p
  WHERE p.device_fingerprint = p_fingerprint
    AND p_fingerprint IS NOT NULL
    AND p_fingerprint != '';
$$;

-- Indexes (only on columns that actually exist after our ALTER above)
CREATE INDEX IF NOT EXISTS idx_profiles_device_fp     ON public.profiles(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);

-- Admin policy to update account status (flag/suspend accounts)
DROP POLICY IF EXISTS "Admin can update account status" ON public.profiles;
CREATE POLICY "Admin can update account status"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR auth.jwt() ->> 'email' = 'divineandbassey@gmail.com'
    OR auth.jwt() ->> 'email' = 'prosperwithbassey@gmail.com'
  );
