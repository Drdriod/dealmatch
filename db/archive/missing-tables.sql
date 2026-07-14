-- ============================================================
-- DealMatch: Missing Tables Patch v1.2
-- Run AFTER supabase-schema.sql + profiles-migration.sql
-- ============================================================

-- ─── Matches table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matches (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  match_score numeric DEFAULT 0,
  match_reasons text[] DEFAULT '{}',
  is_shortlisted boolean DEFAULT false,
  contacted   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, property_id)
);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own matches" ON public.matches;
CREATE POLICY "Users see own matches" ON public.matches FOR ALL
  USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user ON public.matches(user_id);

-- ─── Missing columns on professional_applications ──────────
ALTER TABLE public.professional_applications
  ADD COLUMN IF NOT EXISTS company_name       text,
  ADD COLUMN IF NOT EXISTS subscription_plan  text DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS subscription_start timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS referred_amount    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS professional_type  text;

UPDATE public.professional_applications
  SET professional_type = type
  WHERE professional_type IS NULL AND type IS NOT NULL;

-- ─── Missing columns on properties ─────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS view_count    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_period  text DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS landlord_name text,
  ADD COLUMN IF NOT EXISTS rating        numeric(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count  int DEFAULT 0;

-- ─── Missing columns on payments ───────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS professional_type text,
  ADD COLUMN IF NOT EXISTS plan_type         text,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── Missing columns on bookings ───────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guests    int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS room_type text;

-- ─── Professionals compatibility view ──────────────────────
CREATE OR REPLACE VIEW public.professionals AS
  SELECT
    id, user_id,
    type AS professional_type,
    full_name, company_name, email, phone,
    license_no AS license_number,
    years_exp, coverage_areas, bio,
    monthly_fee, status, rating, review_count,
    is_verified, avatar_url, activated_at,
    subscription_plan, subscription_start, subscription_expiry,
    referred_amount, created_at
  FROM public.professional_applications;

NOTIFY pgrst, 'reload schema';
