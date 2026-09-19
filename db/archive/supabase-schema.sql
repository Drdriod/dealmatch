-- ============================================================
-- DealMatch: Master Database Schema
-- Run this FIRST in Supabase SQL Editor
-- ============================================================

-- ─── Profiles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email                text,
  full_name            text,
  phone                text,
  bio                  text,
  avatar_url           text,
  role                 text DEFAULT 'buyer' CHECK (role IN ('buyer','seller','renter','landlord','agent','investor','student','verifier','admin')),
  state                text,
  city                 text,
  -- Onboarding preferences (these are the columns causing the error)
  property_goal        text,
  preferred_states     text[]    DEFAULT '{}',
  property_types       text[]    DEFAULT '{}',
  budget_min           numeric,
  budget_max           numeric,
  needs_financing      boolean   DEFAULT false,
  onboarding_completed boolean   DEFAULT false,
  -- Verification
  is_photo_verified    boolean   DEFAULT false,
  is_live_verified     boolean   DEFAULT false,
  live_verified_at     timestamptz,
  verification_skipped boolean   DEFAULT false,
  updated_at           timestamptz DEFAULT now(),
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile"     ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"   ON public.profiles;
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ─── Properties ─────────────────────────────────────────────
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
  -- Verification workflow (agents verify on-site)
  status         text DEFAULT 'pending_review' CHECK (status IN ('pending_review','under_verification','active','paused','rejected','sold')),
  verified_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at    timestamptz,
  verification_note text,
  -- Hotel/rental extras
  max_guests     int,
  rules          text,
  contact_phone  text,
  contact_email  text,
  custom_terms   text,
  payment_ref    text,
  updated_at     timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active properties" ON public.properties;
DROP POLICY IF EXISTS "Sellers manage own properties" ON public.properties;
DROP POLICY IF EXISTS "Admins manage all properties"  ON public.properties;
CREATE POLICY "Public read active properties" ON public.properties FOR SELECT USING (status = 'active' OR auth.uid() = seller_id);
CREATE POLICY "Sellers manage own properties" ON public.properties FOR ALL USING (auth.uid() = seller_id);

-- ─── Swipes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swipes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN ('like','pass','super')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, property_id)
);
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own swipes" ON public.swipes FOR ALL USING (auth.uid() = user_id);

-- ─── Bookings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookings (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id    uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  category_id    uuid,
  guest_name     text NOT NULL,
  guest_phone    text NOT NULL,
  guest_email    text,
  checkin_date   date NOT NULL,
  checkout_date  date NOT NULL,
  rooms_booked   int  NOT NULL DEFAULT 1,
  guests         int  DEFAULT 1,
  room_type      text,
  total_amount   numeric,
  payment_ref    text,
  source         text DEFAULT 'dealmatch',
  status         text DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes          text,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create bookings" ON public.bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Owners can view bookings"   ON public.bookings FOR SELECT
  USING (property_id IN (SELECT id FROM public.properties WHERE seller_id = auth.uid()));

-- ─── Room Categories ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_categories (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id     uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  name            text NOT NULL,
  total_rooms     int NOT NULL DEFAULT 1,
  available_rooms int NOT NULL DEFAULT 1,
  price_per_night numeric,
  description     text,
  amenities       text[]  DEFAULT '{}',
  is_active       boolean DEFAULT true,
  updated_at      timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read room categories" ON public.room_categories FOR SELECT USING (true);
CREATE POLICY "Owners manage room categories" ON public.room_categories FOR ALL
  USING (property_id IN (SELECT id FROM public.properties WHERE seller_id = auth.uid()));

-- ─── Professional Applications ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_applications (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type            text NOT NULL,
  full_name       text NOT NULL,
  company         text,
  phone           text NOT NULL,
  email           text NOT NULL,
  license_no      text,
  years_exp       int  DEFAULT 0,
  coverage_areas  text,
  bio             text,
  monthly_fee     int  NOT NULL,
  status          text DEFAULT 'pending_payment',
  rating          numeric(2,1) DEFAULT 4.5,
  review_count    int DEFAULT 0,
  is_verified     boolean DEFAULT true,
  avatar_url      text,
  activated_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.professional_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert applications" ON public.professional_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users view own applications" ON public.professional_applications FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Public read active professionals" ON public.professional_applications FOR SELECT
  USING (status = 'active');

-- ─── Professional Requests (in-app contact) ───────────────────
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
ALTER TABLE public.professional_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create requests" ON public.professional_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Users view own requests"    ON public.professional_requests FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- ─── Professional Reviews ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_reviews (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id text NOT NULL,
  reviewer_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name   text NOT NULL,
  rating          numeric(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text     text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.professional_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reviews"   ON public.professional_reviews FOR SELECT USING (true);
CREATE POLICY "Auth users write reviews"  ON public.professional_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- ─── Payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reference    text UNIQUE NOT NULL,
  amount       numeric NOT NULL,
  currency     text DEFAULT 'NGN',
  payment_type text,
  email        text,
  status       text DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  verified_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages payments" ON public.payments FOR ALL USING (true);

-- ─── Crypto Payments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crypto_payments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name    text,
  user_phone   text,
  user_email   text,
  reference    text UNIQUE NOT NULL,
  description  text NOT NULL,
  coin         text,
  usdt_amount  numeric NOT NULL,
  total_amount numeric,
  network      text NOT NULL,
  network_label text,
  wallet_addr  text,
  tx_hash      text,
  status       text DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
  metadata     text,
  confirmed_at timestamptz,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.crypto_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit crypto"   ON public.crypto_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Users view own payments"    ON public.crypto_payments FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- ─── Rental Enquiries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_enquiries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id   uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  tenant_name   text NOT NULL,
  tenant_phone  text NOT NULL,
  tenant_email  text,
  move_in_date  date,
  duration      int DEFAULT 12,
  message       text,
  status        text DEFAULT 'pending' CHECK (status IN ('pending','contacted','converted','closed')),
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.rental_enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit enquiry" ON public.rental_enquiries FOR INSERT WITH CHECK (true);

-- ─── Deal Agreements ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_agreements (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id      uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  buyer_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_name       text NOT NULL,
  buyer_email      text,
  buyer_phone      text,
  buyer_signature  text NOT NULL,
  agreement_text   text NOT NULL,
  category         text DEFAULT 'sale',
  status           text DEFAULT 'buyer_signed' CHECK (status IN ('buyer_signed','lister_signed','completed','cancelled')),
  lister_signed_at timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE public.deal_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers view own agreements"    ON public.deal_agreements FOR SELECT USING (auth.uid() = buyer_id);
CREATE POLICY "Auth users create agreements"  ON public.deal_agreements FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- ─── Escrow Transactions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.escrow_transactions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id  uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  tenant_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount       numeric NOT NULL,
  platform_fee numeric,
  payment_ref  text,
  status       text DEFAULT 'pending' CHECK (status IN ('pending','funded','released','refunded','disputed')),
  funded_at    timestamptz,
  released_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own escrow" ON public.escrow_transactions FOR SELECT
  USING (auth.uid() = tenant_id);

-- ─── Mortgage Applications ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mortgage_applications (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name        text NOT NULL,
  phone            text NOT NULL,
  email            text,
  monthly_income   numeric,
  employment_type  text DEFAULT 'employed' CHECK (employment_type IN ('employed','self_employed','business_owner','retired')),
  property_value   numeric,
  down_payment     numeric,
  loan_term_years  int DEFAULT 15,
  property_type    text,
  property_state   text,
  lender_id        text,
  status           text DEFAULT 'pending' CHECK (status IN ('pending','reviewing','approved','rejected','disbursed')),
  notes            text,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE public.mortgage_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own applications" ON public.mortgage_applications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone can submit mortgage app" ON public.mortgage_applications FOR INSERT WITH CHECK (true);

-- ─── Avatars Storage Policy ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('property-images', 'property-images', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar public read"   ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Avatar user upload"   ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid():text = (storage.foldername(name))[1]);
CREATE POLICY "Avatar user update"   ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid():text = (storage.foldername(name))[1]);
CREATE POLICY "Property img public"  ON storage.objects FOR SELECT USING (bucket_id = 'property-images');
CREATE POLICY "Property img upload"  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'property-images' AND auth.uid() IS NOT NULL);

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_properties_status        ON public.properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_category      ON public.properties(category);
CREATE INDEX IF NOT EXISTS idx_properties_state         ON public.properties(state);
CREATE INDEX IF NOT EXISTS idx_properties_seller        ON public.properties(seller_id);
CREATE INDEX IF NOT EXISTS idx_swipes_user              ON public.swipes(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_property        ON public.bookings(property_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_pro_apps_type            ON public.professional_applications(type, status);
CREATE INDEX IF NOT EXISTS idx_rental_enquiries_prop    ON public.rental_enquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_mortgage_apps_user       ON public.mortgage_applications(user_id);
