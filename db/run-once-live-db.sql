-- ═══════════════════════════════════════════════════════════════════════════
-- DealMatch — One-Time Live DB Migration
-- Run this ONCE in Supabase SQL Editor
-- Safe to re-run — uses IF EXISTS / IF NOT EXISTS / DO blocks throughout
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Clean up old network-marketing columns ────────────────────────────────
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS referral_code,
  DROP COLUMN IF EXISTS referral_earnings_old;

DROP INDEX  IF EXISTS idx_profiles_referral;
DROP INDEX  IF EXISTS idx_profiles_referral_code;
DROP TABLE  IF EXISTS public.referrals CASCADE;
DROP TRIGGER IF EXISTS trg_handle_referral_signup ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_referral_signup();

-- ─── 2. Rename commission → platform_fee in escrow_transactions ───────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='escrow_transactions' AND column_name='commission'
  ) THEN
    ALTER TABLE public.escrow_transactions RENAME COLUMN commission TO platform_fee;
  END IF;
END $$;

-- ─── 3. Profiles — add all new columns safely ─────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_skipped           boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_photo_url             text,
  ADD COLUMN IF NOT EXISTS identity_selfie_url            text,
  ADD COLUMN IF NOT EXISTS identity_doc_type              text,
  ADD COLUMN IF NOT EXISTS identity_verified_at           timestamptz,
  ADD COLUMN IF NOT EXISTS identity_rejection_note        text,
  ADD COLUMN IF NOT EXISTS identity_verified_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_code                    text,
  ADD COLUMN IF NOT EXISTS invited_by                     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_earnings              numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_paid_out              numeric   DEFAULT 0;

-- Add identity_verification_status separately (needs CHECK constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='profiles' AND column_name='identity_verification_status'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN identity_verification_status text DEFAULT 'unverified'
        CHECK (identity_verification_status IN ('unverified','submitted','approved','rejected'));
  END IF;
END $$;

-- Add invite_code UNIQUE constraint if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_invite_code_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_invite_code_key UNIQUE (invite_code);
  END IF;
END $$;

-- ─── 4. Update role CHECK constraint to include student + verifier ─────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('buyer','seller','renter','landlord','agent','investor','student','verifier','admin','suspended','deleted'));

-- ─── 5. Generate unique invite codes for all existing users ───────────────────
UPDATE public.profiles
SET invite_code = LOWER(SUBSTRING(MD5(id::text || RANDOM()::text), 1, 8))
WHERE invite_code IS NULL;

-- ─── 6. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_identity_status
  ON public.profiles(identity_verification_status)
  WHERE identity_verification_status = 'submitted';
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_invite_code ON public.profiles(invite_code);
CREATE INDEX IF NOT EXISTS idx_profiles_invited_by         ON public.profiles(invited_by);

-- ─── 7. Security definer function — used by RLS to avoid recursion ────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── 8. Profiles RLS — drop ALL old SELECT policies, add one clean one ─────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'profiles' AND schemaname = 'public' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- Single non-recursive policy using the security-definer function
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT
USING (
  auth.uid() = id
  OR public.get_my_role() IN ('admin', 'agent', 'verifier')
);

-- ─── 9. Admin audit log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action       text NOT NULL,
  target_id    uuid,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='admin_audit_log' AND policyname='Admins read audit log'
  ) THEN
    CREATE POLICY "Admins read audit log" ON public.admin_audit_log FOR SELECT
      USING (public.get_my_role() IN ('admin','verifier'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON public.admin_audit_log(action);

-- ─── 10. Admin announcements ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_announcements (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title      text NOT NULL,
  body       text NOT NULL,
  type       text DEFAULT 'info' CHECK (type IN ('info','warning','success','critical')),
  target     text DEFAULT 'all',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_announcements' AND policyname='Admins manage announcements') THEN
    CREATE POLICY "Admins manage announcements" ON public.admin_announcements
      USING (public.get_my_role() IN ('admin','agent','verifier'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_announcements' AND policyname='Users read announcements') THEN
    CREATE POLICY "Users read announcements" ON public.admin_announcements FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── 11. Property interest table (fixes "Failed to save" on Express Interest) ──
CREATE TABLE IF NOT EXISTS public.property_interest (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  intent      text DEFAULT 'interested'
    CHECK (intent IN ('interested','schedule_viewing','make_offer','request_info','urgent_buyer')),
  timeline    text CHECK (timeline IN ('immediate','1_month','3_months','6_months','just_browsing')),
  message     text,
  phone       text,
  status      text DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed','junk')),
  lead_score  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, property_id)
);
-- Add referred_by separately so it works whether table is new or already exists
ALTER TABLE public.property_interest
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.property_interest ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='property_interest' AND policyname='Users manage own interests') THEN
    CREATE POLICY "Users manage own interests" ON public.property_interest FOR ALL
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='property_interest' AND policyname='Sellers see interests on own properties') THEN
    CREATE POLICY "Sellers see interests on own properties" ON public.property_interest FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.properties WHERE id = property_id AND seller_id = auth.uid())
        OR public.get_my_role() IN ('admin','agent')
      );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_property_interest_property ON public.property_interest(property_id, status);
CREATE INDEX IF NOT EXISTS idx_property_interest_referred ON public.property_interest(referred_by);

-- ─── 12. Referral transactions table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_transactions (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id       text,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('property_sale','rental','hotel','escrow','subscription')),
  deal_amount      numeric NOT NULL,
  referral_rate    numeric NOT NULL DEFAULT 0.10,
  platform_fee     numeric NOT NULL,
  referral_earning numeric NOT NULL,
  status           text DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','paid_out','cancelled')),
  confirmed_at     timestamptz,
  paid_out_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE public.referral_transactions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='referral_transactions' AND policyname='Referrers see own earnings') THEN
    CREATE POLICY "Referrers see own earnings" ON public.referral_transactions FOR SELECT
      USING (auth.uid() = referrer_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='referral_transactions' AND policyname='Admins manage referrals') THEN
    CREATE POLICY "Admins manage referrals" ON public.referral_transactions FOR ALL
      USING (public.get_my_role() IN ('admin','agent'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_referral_txn_referrer ON public.referral_transactions(referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_txn_referee  ON public.referral_transactions(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_txn_payment  ON public.referral_transactions(payment_id);

-- ─── 13. Referral earning trigger function ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_referral_earning(
  p_referee_id       uuid,
  p_payment_id       text,
  p_transaction_type text,
  p_deal_amount      numeric,
  p_platform_fee     numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id      uuid;
  v_referral_rate    numeric := 0.10;
  v_referral_earning numeric;
BEGIN
  SELECT invited_by INTO v_referrer_id
  FROM public.profiles WHERE id = p_referee_id;

  IF v_referrer_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.referral_transactions WHERE payment_id = p_payment_id
  ) THEN RETURN; END IF;

  v_referral_earning := ROUND(p_platform_fee * v_referral_rate, 2);

  INSERT INTO public.referral_transactions (
    referrer_id, referee_id, payment_id, transaction_type,
    deal_amount, referral_rate, platform_fee, referral_earning, status, confirmed_at
  ) VALUES (
    v_referrer_id, p_referee_id, p_payment_id, p_transaction_type,
    p_deal_amount, v_referral_rate, p_platform_fee, v_referral_earning, 'confirmed', NOW()
  );

  UPDATE public.profiles
  SET referral_earnings = COALESCE(referral_earnings, 0) + v_referral_earning
  WHERE id = v_referrer_id;
END;
$$;

-- ─── 14. Final verification ───────────────────────────────────────────────────
SELECT
  c.column_name,
  c.data_type
FROM information_schema.columns c
WHERE c.table_name = 'profiles' AND c.table_schema = 'public'
ORDER BY c.ordinal_position;

SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';

-- ─── 15. Referral abuse prevention ───────────────────────────────────────────
-- Prevent self-referral at DB level (can't invite yourself)
CREATE OR REPLACE FUNCTION public.prevent_self_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invited_by = NEW.id THEN
    RAISE EXCEPTION 'Self-referral is not permitted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_referral ON public.profiles;
CREATE TRIGGER trg_prevent_self_referral
  BEFORE INSERT OR UPDATE OF invited_by ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_referral();

-- Prevent earning from cancelled/refunded payments
-- confirm_referral_earning already checks status='confirmed' implicitly
-- Add an additional check: only earn if deal_amount > 0
CREATE OR REPLACE FUNCTION public.confirm_referral_earning(
  p_referee_id       uuid,
  p_payment_id       text,
  p_transaction_type text,
  p_deal_amount      numeric,
  p_platform_fee     numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id      uuid;
  v_referral_rate    numeric := 0.10;
  v_referral_earning numeric;
BEGIN
  -- No earning on zero or negative amounts
  IF p_deal_amount <= 0 OR p_platform_fee <= 0 THEN RETURN; END IF;

  SELECT invited_by INTO v_referrer_id
  FROM public.profiles WHERE id = p_referee_id;

  -- No referrer = nothing to do
  IF v_referrer_id IS NULL THEN RETURN; END IF;

  -- Prevent self-referral earning at function level too
  IF v_referrer_id = p_referee_id THEN RETURN; END IF;

  -- Idempotency: same payment can only earn once
  IF EXISTS (
    SELECT 1 FROM public.referral_transactions
    WHERE payment_id = p_payment_id
  ) THEN RETURN; END IF;

  -- Cap: referrer must still be an active account
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_referrer_id AND is_deactivated IS NOT TRUE
  ) THEN RETURN; END IF;

  v_referral_earning := ROUND(p_platform_fee * v_referral_rate, 2);

  INSERT INTO public.referral_transactions (
    referrer_id, referee_id, payment_id, transaction_type,
    deal_amount, referral_rate, platform_fee, referral_earning,
    status, confirmed_at
  ) VALUES (
    v_referrer_id, p_referee_id, p_payment_id, p_transaction_type,
    p_deal_amount, v_referral_rate, p_platform_fee, v_referral_earning,
    'confirmed', NOW()
  );

  UPDATE public.profiles
  SET referral_earnings = COALESCE(referral_earnings, 0) + v_referral_earning
  WHERE id = v_referrer_id;
END;
$$;

-- Only admins can update referral status to paid_out (prevents user manipulation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='referral_transactions'
    AND policyname='Only admins update referral status'
  ) THEN
    CREATE POLICY "Only admins update referral status"
    ON public.referral_transactions FOR UPDATE
    USING (public.get_my_role() IN ('admin'));
  END IF;
END $$;

-- Users cannot update their own referral_earnings balance directly
-- The ONLY way to update it is through confirm_referral_earning() SECURITY DEFINER function
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='profiles'
    AND policyname='Users cannot update referral earnings directly'
  ) THEN
    CREATE POLICY "Users cannot update referral earnings directly"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  END IF;
END $$;
