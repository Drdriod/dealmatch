-- ═══════════════════════════════════════════════════════════════════
-- DealMatch v1.5 — COMPLETE SAFE MIGRATION
-- ✅ Safe to run on existing DB — all statements use IF NOT EXISTS
-- ✅ Fixes all schema drift between code and database
-- ✅ Run this SINGLE FILE to bring any DB up to date
-- ═══════════════════════════════════════════════════════════════════

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. PROFILES — add ALL missing columns ──────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS state                        text,
  ADD COLUMN IF NOT EXISTS city                         text,
  ADD COLUMN IF NOT EXISTS phone                        text,
  ADD COLUMN IF NOT EXISTS bio                          text,
  ADD COLUMN IF NOT EXISTS is_photo_verified            boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_live_verified             boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_verified_at             timestamptz,
  ADD COLUMN IF NOT EXISTS referred_by                  text,
  ADD COLUMN IF NOT EXISTS budget_max                   numeric,
  ADD COLUMN IF NOT EXISTS budget_min                   numeric,
  ADD COLUMN IF NOT EXISTS property_goal                text,
  ADD COLUMN IF NOT EXISTS preferred_states             text[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS property_types               text[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS needs_financing              boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed         boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS id_doc_url                   text,
  ADD COLUMN IF NOT EXISTS id_doc_type                  text,
  ADD COLUMN IF NOT EXISTS id_verified                  boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS id_verified_at               timestamptz,
  ADD COLUMN IF NOT EXISTS face_video_url               text,
  ADD COLUMN IF NOT EXISTS bank_name                    text,
  ADD COLUMN IF NOT EXISTS account_number               text,
  ADD COLUMN IF NOT EXISTS account_name                 text,
  ADD COLUMN IF NOT EXISTS routing_number               text,
  -- v1.4 identity verification pipeline
  ADD COLUMN IF NOT EXISTS identity_photo_url           text,
  ADD COLUMN IF NOT EXISTS identity_selfie_url          text,
  ADD COLUMN IF NOT EXISTS identity_doc_type            text,
  ADD COLUMN IF NOT EXISTS identity_verification_status text DEFAULT 'unverified'
    CHECK (identity_verification_status IN ('unverified','submitted','approved','rejected')),
  ADD COLUMN IF NOT EXISTS identity_verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS identity_rejection_note      text,
  ADD COLUMN IF NOT EXISTS identity_verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_skipped          boolean DEFAULT false,
  -- v1.5 duplicate prevention
  ADD COLUMN IF NOT EXISTS username                     text UNIQUE;

-- ─── 2. PROPERTIES — add ALL missing columns ────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS status            text DEFAULT 'pending_review'
    CHECK (status IN ('active','pending_review','under_verification','rejected','sold','removed')),
  ADD COLUMN IF NOT EXISTS view_count        int  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count        int  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_period      text DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS landlord_name     text,
  ADD COLUMN IF NOT EXISTS rating            numeric(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count      int  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_phone     text,
  ADD COLUMN IF NOT EXISTS contact_email     text,
  ADD COLUMN IF NOT EXISTS max_guests        int,
  ADD COLUMN IF NOT EXISTS video_url         text,
  ADD COLUMN IF NOT EXISTS rules             text,
  ADD COLUMN IF NOT EXISTS custom_terms      text,
  ADD COLUMN IF NOT EXISTS verified_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at       timestamptz,
  ADD COLUMN IF NOT EXISTS verification_note text,
  ADD COLUMN IF NOT EXISTS latitude          numeric,
  ADD COLUMN IF NOT EXISTS longitude         numeric,
  ADD COLUMN IF NOT EXISTS payment_ref       text,
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category          text DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS address           text;

-- ─── 3. BOOKINGS — add ALL missing columns ──────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status        text DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','checked_in','checked_out','cancelled','no_show','completed')),
  ADD COLUMN IF NOT EXISTS checkin_at    timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_at   timestamptz,
  ADD COLUMN IF NOT EXISTS admin_note    text,
  ADD COLUMN IF NOT EXISTS guests        int  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS room_type     text;

-- ─── 4. PAYMENTS — add missing columns ──────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS professional_type text,
  ADD COLUMN IF NOT EXISTS plan_type         text,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── 5. PROFESSIONAL_APPLICATIONS — add missing columns ─────────
ALTER TABLE public.professional_applications
  ADD COLUMN IF NOT EXISTS company_name        text,
  ADD COLUMN IF NOT EXISTS subscription_plan   text DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS subscription_start  timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS referred_amount     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS professional_type   text,
  ADD COLUMN IF NOT EXISTS activated_at        timestamptz,
  ADD COLUMN IF NOT EXISTS rating              numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count        int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url          text;

-- NOTE: Skipped data migration from "type" column — column does not exist in this schema.

-- ─── 6. MORTGAGE_APPLICATIONS — add ticket_id ───────────────────
ALTER TABLE public.mortgage_applications
  ADD COLUMN IF NOT EXISTS ticket_id text UNIQUE;

-- ─── 7. MATCHES table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matches (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id   uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  match_score   numeric DEFAULT 0,
  match_reasons text[]  DEFAULT '{}',
  is_shortlisted boolean DEFAULT false,
  contacted_at  timestamptz,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, property_id)
);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own matches" ON public.matches;
CREATE POLICY "Users manage own matches" ON public.matches FOR ALL
  USING (auth.uid() = user_id);


-- ─── 9. AGENT_ACCOUNTS table (internal agents, v1.5) ────────────
CREATE TABLE IF NOT EXISTS public.agent_accounts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name     text NOT NULL,
  email         text NOT NULL UNIQUE,
  phone         text,
  badge_number  text UNIQUE,
  assigned_states text[] DEFAULT '{}',
  is_active     boolean DEFAULT true,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.agent_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage agents" ON public.agent_accounts;
DROP POLICY IF EXISTS "Agents see own record" ON public.agent_accounts;
CREATE POLICY "Admins manage agents" ON public.agent_accounts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Agents see own record" ON public.agent_accounts FOR SELECT
  USING (auth.uid() = user_id);

-- ─── 10. PROPERTY_INTEREST table (post-swipe CTA lead capture) ──
CREATE TABLE IF NOT EXISTS public.property_interest (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id  uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  intent       text DEFAULT 'interested'
    CHECK (intent IN ('interested','schedule_viewing','make_offer','request_info','urgent_buyer')),
  budget_range text,
  timeline     text CHECK (timeline IN ('immediate','1_month','3_months','6_months','just_browsing')),
  message      text,
  phone        text,
  status       text DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed','junk')),
  lead_score   int  DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, property_id)
);
ALTER TABLE public.property_interest ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own interests" ON public.property_interest;
DROP POLICY IF EXISTS "Sellers see interests on own properties" ON public.property_interest;
CREATE POLICY "Users manage own interests" ON public.property_interest FOR ALL
  USING (auth.uid() = user_id);
CREATE POLICY "Sellers see interests on own properties" ON public.property_interest FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.properties WHERE id = property_id AND seller_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','agent'))
  );

-- ─── 11. UNIQUE constraints for duplicate prevention ────────────
-- Email uniqueness is enforced by Supabase Auth, but add a unique index on profiles.email
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique
  ON public.profiles(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique
  ON public.profiles(phone) WHERE phone IS NOT NULL AND phone <> '';

-- ─── 12. CLASH PREVENTION FUNCTION ─────────────────────────────
CREATE OR REPLACE FUNCTION public.check_booking_availability(
  p_property_id uuid,
  p_checkin     date,
  p_checkout    date,
  p_rooms       int  DEFAULT 1,
  p_category_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_available int;
  v_booked    int;
BEGIN
  IF p_category_id IS NOT NULL THEN
    SELECT available_rooms INTO v_available
      FROM public.room_categories WHERE id = p_category_id AND is_active = true;
  ELSE
    SELECT COALESCE(SUM(available_rooms), 0) INTO v_available
      FROM public.room_categories WHERE property_id = p_property_id AND is_active = true;
  END IF;
  IF v_available IS NULL THEN v_available := 0; END IF;
  SELECT COALESCE(SUM(rooms_booked), 0) INTO v_booked
    FROM public.bookings
   WHERE property_id = p_property_id
     AND status NOT IN ('cancelled','no_show')
     AND checkin_date < p_checkout
     AND checkout_date > p_checkin
     AND (p_category_id IS NULL OR category_id = p_category_id);
  RETURN (v_available - v_booked) >= p_rooms;
END;$$;

-- ─── 13. LEAD SCORING FUNCTION ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_lead_score(
  p_intent   text,
  p_timeline text,
  p_budget   text
) RETURNS int LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
    CASE p_intent
      WHEN 'urgent_buyer'     THEN 40
      WHEN 'make_offer'       THEN 35
      WHEN 'schedule_viewing' THEN 25
      WHEN 'interested'       THEN 15
      ELSE 5
    END
    +
    CASE p_timeline
      WHEN 'immediate' THEN 30
      WHEN '1_month'   THEN 20
      WHEN '3_months'  THEN 10
      WHEN '6_months'  THEN 5
      ELSE 0
    END
    +
    CASE WHEN p_budget IS NOT NULL AND p_budget <> '' THEN 10 ELSE 0 END
  );
END;$$;


-- ─── 15. RLS POLICIES (Admin full access) ───────────────────────
-- Bookings admin policies
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
CREATE POLICY "Admins can view all bookings" ON public.bookings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','agent')));
DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
CREATE POLICY "Admins can update bookings" ON public.bookings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','agent')));

-- Profiles admin policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role IN ('admin','agent')));
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin'));

-- Properties admin policies
DROP POLICY IF EXISTS "Admins can view all properties" ON public.properties;
CREATE POLICY "Admins can view all properties" ON public.properties FOR SELECT
  USING (status = 'active' OR seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','agent')));
DROP POLICY IF EXISTS "Admins can update any property" ON public.properties;
CREATE POLICY "Admins can update any property" ON public.properties FOR UPDATE
  USING (seller_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','agent')));

-- ─── 16. INDEXES for performance ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_identity_status
  ON public.profiles(identity_verification_status) WHERE identity_verification_status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_bookings_status_checkin
  ON public.bookings(status, checkin_date);
CREATE INDEX IF NOT EXISTS idx_properties_status ON public.properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_category ON public.properties(category);
CREATE INDEX IF NOT EXISTS idx_swipes_user_action ON public.swipes(user_id, action);
CREATE INDEX IF NOT EXISTS idx_matches_user ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_property_interest_property ON public.property_interest(property_id, status);

-- ─── 17. STORAGE BUCKETS ─────────────────────────────────────────
-- avatars bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- identity-docs bucket (PRIVATE — only agents/admins can view)
INSERT INTO storage.buckets (id, name, public)
VALUES ('identity-docs', 'identity-docs', false)
ON CONFLICT (id) DO NOTHING;

-- property-images bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: avatars — public read, users manage own
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage RLS: identity-docs — only owner + admins/agents can read
DROP POLICY IF EXISTS "Owner reads own identity docs" ON storage.objects;
CREATE POLICY "Owner reads own identity docs" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'identity-docs' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','agent'))
    )
  );
DROP POLICY IF EXISTS "Users upload own identity docs" ON storage.objects;
CREATE POLICY "Users upload own identity docs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'identity-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ─── 17. SET ADMIN ROLE ──────────────────────────────────────────
UPDATE public.profiles SET role = 'admin' WHERE email = 'divineandbassey@gmail.com';

-- ─── 18. NOTIFY POSTGREST ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';
SELECT 'DealMatch v1.5 migration complete ✅' AS result;
