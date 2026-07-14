-- ============================================================
-- DealMatch: Comprehensive Security Audit & Missing Tables Fix
-- ============================================================
-- This migration fixes the missing 'professional_requests' table error
-- and hardens the entire database schema against unauthorized access.
-- ============================================================

-- 1. Ensure all tables exist with correct schemas
-- ------------------------------------------------------------

-- Profiles (Core user data)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email                text,
  full_name            text,
  phone                text,
  bio                  text,
  avatar_url           text,
  role                 text DEFAULT 'buyer' CHECK (role IN ('buyer','seller','renter','landlord','agent','investor','admin')),
  state                text,
  city                 text,
  property_goal        text,
  preferred_states     text[]    DEFAULT '{}',
  property_types       text[]    DEFAULT '{}',
  budget_min           numeric,
  budget_max           numeric,
  needs_financing      boolean   DEFAULT false,
  onboarding_completed boolean   DEFAULT false,
  is_photo_verified    boolean   DEFAULT false,
  is_live_verified     boolean   DEFAULT false,
  live_verified_at     timestamptz,
  referred_by          text,
  updated_at           timestamptz DEFAULT now(),
  created_at           timestamptz DEFAULT now()
);

-- Properties
CREATE TABLE IF NOT EXISTS public.properties (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text,
  property_type  text NOT NULL,
  listing_type   text DEFAULT 'For Sale',
  category       text DEFAULT 'sale' CHECK (category IN ('sale','rental','shortlet','hotel')),
  price          numeric NOT NULL DEFAULT 0,
  state          text,
  city           text,
  address        text,
  bedrooms       int,
  bathrooms      int,
  size_sqm       numeric,
  features       text[]    DEFAULT '{}',
  documents      text[]    DEFAULT '{}',
  images         jsonb     DEFAULT '[]',
  video_url      text,
  latitude       numeric,
  longitude      numeric,
  status         text DEFAULT 'pending_review' CHECK (status IN ('pending_review','under_verification','active','paused','rejected','sold')),
  verified_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at    timestamptz,
  verification_note text,
  max_guests     int,
  rules          text,
  contact_phone  text,
  contact_email  text,
  custom_terms   text,
  payment_ref    text,
  updated_at     timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);

-- Professional Requests (FIX for the reported error)
CREATE TABLE IF NOT EXISTS public.professional_requests (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  professional_id   text NOT NULL,
  professional_type text NOT NULL,
  professional_name text NOT NULL,
  client_name       text NOT NULL,
  client_phone      text NOT NULL,
  client_email      text,
  details           text,
  urgency           text DEFAULT 'normal' CHECK (urgency IN ('normal','soon','urgent')),
  status            text DEFAULT 'pending' CHECK (status IN ('pending','connected','completed','cancelled')),
  created_at        timestamptz DEFAULT now()
);

-- Messages (Internal communication)
CREATE TABLE IF NOT EXISTS public.messages (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id    uuid NOT NULL,
  sender_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name  text,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  property_id  uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  content      text NOT NULL,
  read         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- Disputes
CREATE TABLE IF NOT EXISTS public.disputes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id  uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  reporter_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  against_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_id   uuid,
  reason       text NOT NULL,
  description  text,
  evidence_urls text[] DEFAULT '{}',
  status       text DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
  resolution   text,
  created_at   timestamptz DEFAULT now()
);

-- 2. Enable RLS on ALL tables
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- 3. Security Hardening Policies
-- ------------------------------------------------------------

-- PROFILES: Prevent self-elevation of roles or verification status
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles 
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id AND 
  (
    -- Users cannot change their own role or verification status
    role = (SELECT role FROM public.profiles WHERE id = auth.uid()) AND
    is_photo_verified = (SELECT is_photo_verified FROM public.profiles WHERE id = auth.uid()) AND
    is_live_verified = (SELECT is_live_verified FROM public.profiles WHERE id = auth.uid())
  )
);

-- PROPERTIES: Prevent unauthorized status changes to 'active'
DROP POLICY IF EXISTS "Sellers manage own properties" ON public.properties;
CREATE POLICY "Sellers manage own properties" ON public.properties 
FOR ALL USING (auth.uid() = seller_id)
WITH CHECK (
  auth.uid() = seller_id AND
  (
    -- Prevent sellers from setting their own property to 'active' without review
    (status <> 'active' OR (SELECT status FROM public.properties WHERE id = properties.id) = 'active')
  )
);

-- PROFESSIONAL REQUESTS: Require authentication for security
DROP POLICY IF EXISTS "Authenticated users can request professionals" ON public.professional_requests;
CREATE POLICY "Authenticated users can request professionals" ON public.professional_requests 
FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own requests" ON public.professional_requests;
CREATE POLICY "Users see own requests" ON public.professional_requests 
FOR SELECT USING (auth.uid() = user_id);

-- MESSAGES: Strict participant-only access
DROP POLICY IF EXISTS "Users see own messages" ON public.messages;
CREATE POLICY "Users see own messages" ON public.messages 
FOR ALL USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- DISPUTES: Reporter-only access
DROP POLICY IF EXISTS "Users see own disputes" ON public.disputes;
CREATE POLICY "Users see own disputes" ON public.disputes 
FOR ALL USING (auth.uid() = reporter_id);

-- STORAGE: Secure 'avatars' bucket
-- Ensure users can only upload to their own folder (named by their UID)
DROP POLICY IF EXISTS "Avatar user upload" ON storage.objects;
CREATE POLICY "Avatar user upload" ON storage.objects 
FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Avatar user update" ON storage.objects;
CREATE POLICY "Avatar user update" ON storage.objects 
FOR UPDATE USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Final Cleanup
-- ------------------------------------------------------------
-- Notify Supabase to refresh schema cache
NOTIFY pgrst, 'reload schema';
