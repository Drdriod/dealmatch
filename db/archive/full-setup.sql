-- ============================================================
-- DEALMATCH: FULL DATABASE SETUP & SECURITY HARDENING
-- ============================================================
-- Instructions: 
-- 1. Open your Supabase Dashboard.
-- 2. Go to SQL Editor -> New query.
-- 3. Paste this entire block and click "Run".
-- ============================================================

-- ─── 1. EXTENSIONS ──────────────────────────────────────────
-- Ensure pgcrypto is available for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 2. BANK DETAILS ────────────────────────────────────────
-- Add bank details columns to profiles table safely
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS account_number text,
ADD COLUMN IF NOT EXISTS account_name text,
ADD COLUMN IF NOT EXISTS routing_number text;

-- Add a check constraint for Nigerian account numbers (10 digits)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_number_check;
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_account_number_check 
CHECK (account_number IS NULL OR account_number ~ '^\d{10}$');

-- ─── 3. MORTGAGE WORKFLOW & TICKET SYSTEM ───────────────────
-- Ensure mortgage_applications table exists (if not already created)
CREATE TABLE IF NOT EXISTS public.mortgage_applications (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name        text NOT NULL,
  phone            text NOT NULL,
  email            text,
  monthly_income   numeric,
  employment_type  text,
  property_value   numeric NOT NULL,
  down_payment     numeric,
  loan_term_years  int,
  property_type    text,
  property_state   text,
  lender_id        text,
  status           text DEFAULT 'pending',
  notes            text,
  ticket_id        text UNIQUE,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Update status constraint with new processing states
ALTER TABLE public.mortgage_applications DROP CONSTRAINT IF EXISTS mortgage_applications_status_check;
ALTER TABLE public.mortgage_applications 
ADD CONSTRAINT mortgage_applications_status_check 
CHECK (status IN ('pending', 'processing', 'reviewing', 'approved', 'declined', 'finished', 'on_hold'));

-- Function to generate a unique human-readable ticket ID
CREATE OR REPLACE FUNCTION public.generate_mortgage_ticket_id() 
RETURNS trigger AS $$
BEGIN
  NEW.ticket_id := 'MTG-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-generate ticket_id on new applications
DROP TRIGGER IF EXISTS trg_generate_mortgage_ticket_id ON public.mortgage_applications;
CREATE TRIGGER trg_generate_mortgage_ticket_id
BEFORE INSERT ON public.mortgage_applications
FOR EACH ROW
WHEN (NEW.ticket_id IS NULL)
EXECUTE FUNCTION public.generate_mortgage_ticket_id();

-- ─── 4. SECURITY HARDENING (RLS POLICIES) ───────────────────
-- Enable RLS on core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mortgage_applications ENABLE ROW LEVEL SECURITY;

-- PROFILE POLICIES
-- Allow users to see their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- PROTECT BANK DETAILS: Ensure lenders cannot see bank details of users
-- We achieve this by excluding bank columns from public select if we were using column-level RLS, 
-- but in Supabase, we rely on the fact that lenders only SELECT from mortgage_applications, not profiles.

-- MORTGAGE APPLICATION POLICIES
-- 1. Users can view their own applications
DROP POLICY IF EXISTS "Users manage own applications" ON public.mortgage_applications;
CREATE POLICY "Users manage own applications" 
ON public.mortgage_applications 
FOR ALL 
USING (auth.uid() = user_id);

-- 2. Lenders can view all applications (but not the user's private bank details in profiles)
DROP POLICY IF EXISTS "Lenders can view all mortgage applications" ON public.mortgage_applications;
CREATE POLICY "Lenders can view all mortgage applications" 
ON public.mortgage_applications 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'lender' OR role = 'admin')
  )
);

-- 3. Lenders can update application status and add notes
DROP POLICY IF EXISTS "Lenders can update mortgage applications" ON public.mortgage_applications;
CREATE POLICY "Lenders can update mortgage applications" 
ON public.mortgage_applications 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'lender' OR role = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'lender' OR role = 'admin')
  )
);

-- ─── 5. FINAL REFRESH ───────────────────────────────────────
-- Notify PostgREST to reload the schema
NOTIFY pgrst, 'reload schema';
