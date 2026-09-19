-- ============================================================
-- Run this if you ALREADY have the profiles table and are
-- getting "column not found in schema cache" errors.
-- This safely adds missing columns without breaking existing data.
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS property_goal       text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_states    text[]    DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS property_types      text[]    DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS budget_min          numeric;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS budget_max          numeric;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS needs_financing     boolean   DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean  DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_photo_verified   boolean   DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_live_verified    boolean   DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS live_verified_at    timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone               text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio                 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state               text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city                text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role                text      DEFAULT 'buyer';

-- Add missing property columns
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS status            text      DEFAULT 'pending_review';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS verified_by       uuid;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS verified_at       timestamptz;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS verification_note text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS latitude          numeric;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS longitude         numeric;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS max_guests        int;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS contact_phone     text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS contact_email     text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS payment_ref       text;

-- Create mortgage_applications if missing
CREATE TABLE IF NOT EXISTS public.mortgage_applications (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name        text NOT NULL,
  phone            text NOT NULL,
  email            text,
  monthly_income   numeric,
  employment_type  text DEFAULT 'employed',
  property_value   numeric,
  down_payment     numeric,
  loan_term_years  int DEFAULT 15,
  property_type    text,
  property_state   text,
  lender_id        text,
  status           text DEFAULT 'pending',
  notes            text,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE public.mortgage_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can submit mortgage app" ON public.mortgage_applications;
CREATE POLICY "Anyone can submit mortgage app" ON public.mortgage_applications FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users manage own applications"  ON public.mortgage_applications;
CREATE POLICY "Users manage own applications" ON public.mortgage_applications FOR ALL USING (auth.uid() = user_id);

-- Create rental_enquiries if missing
CREATE TABLE IF NOT EXISTS public.rental_enquiries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id   uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  tenant_name   text NOT NULL,
  tenant_phone  text NOT NULL,
  tenant_email  text,
  move_in_date  date,
  duration      int DEFAULT 12,
  message       text,
  status        text DEFAULT 'pending',
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.rental_enquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can submit enquiry" ON public.rental_enquiries;
CREATE POLICY "Anyone can submit enquiry" ON public.rental_enquiries FOR INSERT WITH CHECK (true);

-- Notify Supabase to refresh schema cache
NOTIFY pgrst, 'reload schema';

-- ── Blueprint additions ────────────────────────────────────────

-- In-app messages (landlord ↔ tenant, agent ↔ landlord)
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
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own messages" ON public.messages FOR ALL
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Booking/rental reviews (tenant reviews landlord and property)
CREATE TABLE IF NOT EXISTS public.property_reviews (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id  uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  reviewer_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name text NOT NULL,
  landlord_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rating       numeric(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text  text,
  category     text DEFAULT 'general',
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.property_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read property reviews" ON public.property_reviews FOR SELECT USING (true);
CREATE POLICY "Auth users write reviews"     ON public.property_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

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
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own disputes" ON public.disputes FOR ALL USING (auth.uid() = reporter_id);
CREATE POLICY "Anyone can file dispute" ON public.disputes FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Agent assignments (admin assigns field agents to verify properties)
CREATE TABLE IF NOT EXISTS public.agent_assignments (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id   uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  agent_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','completed','failed')),
  visit_date    timestamptz,
  notes         text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.agent_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents see own assignments" ON public.agent_assignments FOR ALL
  USING (auth.uid() = agent_id OR auth.uid() = assigned_by);

-- ID verification documents
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_doc_url        text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_doc_type       text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_verified       boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_verified_at    timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_video_url    text;

-- Add field_agent role to properties verified_by
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS assigned_agent_id uuid;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
