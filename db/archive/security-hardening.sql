-- ============================================================
-- DealMatch: Security Hardening Patch
-- Run this in Supabase SQL Editor to tighten RLS policies
-- ============================================================

-- 0. Ensure all tables exist before applying policies
-- ------------------------------------------------------------

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text,
  full_name text,
  phone text,
  bio text,
  avatar_url text,
  role text DEFAULT 'buyer',
  is_photo_verified boolean DEFAULT false,
  is_live_verified boolean DEFAULT false
);

-- Properties
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'pending_review'
);

-- Bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL
);

-- Professional Applications
CREATE TABLE IF NOT EXISTS public.professional_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'pending_payment'
);

-- Professional Requests
CREATE TABLE IF NOT EXISTS public.professional_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  professional_id text NOT NULL,
  professional_type text NOT NULL,
  professional_name text NOT NULL,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  client_email text,
  details text,
  urgency text DEFAULT 'normal',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text,
  status text DEFAULT 'pending'
);

-- Crypto Payments
CREATE TABLE IF NOT EXISTS public.crypto_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'pending'
);

-- Rental Enquiries
CREATE TABLE IF NOT EXISTS public.rental_enquiries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  status text DEFAULT 'pending'
);

-- Deal Agreements
CREATE TABLE IF NOT EXISTS public.deal_agreements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Escrow Transactions
CREATE TABLE IF NOT EXISTS public.escrow_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'pending'
);

-- Mortgage Applications
CREATE TABLE IF NOT EXISTS public.mortgage_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'pending'
);

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Disputes
CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 1. Profiles: Prevent self-verification
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles 
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id AND 
  (
    is_photo_verified = (SELECT is_photo_verified FROM public.profiles WHERE id = auth.uid()) AND
    is_live_verified = (SELECT is_live_verified FROM public.profiles WHERE id = auth.uid()) AND
    role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  )
);

-- 2. Properties: Prevent unauthorized status changes
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers manage own properties" ON public.properties;
CREATE POLICY "Sellers manage own properties" ON public.properties 
FOR ALL USING (auth.uid() = seller_id)
WITH CHECK (
  auth.uid() = seller_id AND
  (status <> 'active' OR (SELECT status FROM public.properties WHERE id = properties.id) = 'active')
);

-- 3. Bookings: Require authentication
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON public.bookings;
CREATE POLICY "Authenticated users can create bookings" ON public.bookings 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 4. Professional Applications: Require authentication
ALTER TABLE public.professional_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public insert applications" ON public.professional_applications;
DROP POLICY IF EXISTS "Authenticated users can apply" ON public.professional_applications;
CREATE POLICY "Authenticated users can apply" ON public.professional_applications 
FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- 5. Professional Requests: Require authentication
ALTER TABLE public.professional_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can create requests" ON public.professional_requests;
DROP POLICY IF EXISTS "Authenticated users can request professionals" ON public.professional_requests;
CREATE POLICY "Authenticated users can request professionals" ON public.professional_requests 
FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own requests" ON public.professional_requests;
CREATE POLICY "Users see own requests" ON public.professional_requests 
FOR SELECT USING (auth.uid() = user_id);

-- 6. Payments: Scoped access
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments 
FOR SELECT USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- 7. Crypto Payments: Require authentication
ALTER TABLE public.crypto_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can submit crypto" ON public.crypto_payments;
DROP POLICY IF EXISTS "Authenticated users can submit crypto" ON public.crypto_payments;
CREATE POLICY "Authenticated users can submit crypto" ON public.crypto_payments 
FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- 8. Rental Enquiries: Require authentication
ALTER TABLE public.rental_enquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can submit enquiry" ON public.rental_enquiries;
DROP POLICY IF EXISTS "Authenticated users can submit enquiry" ON public.rental_enquiries;
CREATE POLICY "Authenticated users can submit enquiry" ON public.rental_enquiries 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 9. Deal Agreements: Prevent unauthorized access
ALTER TABLE public.deal_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Buyers view own agreements" ON public.deal_agreements;
CREATE POLICY "Buyers view own agreements" ON public.deal_agreements 
FOR SELECT USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Auth users create agreements" ON public.deal_agreements;
CREATE POLICY "Auth users create agreements" ON public.deal_agreements 
FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- 10. Escrow Transactions: Strict ownership
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own escrow" ON public.escrow_transactions;
CREATE POLICY "Users view own escrow" ON public.escrow_transactions 
FOR SELECT USING (auth.uid() = tenant_id);

-- 11. Mortgage Applications: Strict ownership
ALTER TABLE public.mortgage_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own applications" ON public.mortgage_applications;
CREATE POLICY "Users manage own applications" ON public.mortgage_applications 
FOR ALL USING (auth.uid() = user_id);

-- 12. Messages: Strict participant access
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own messages" ON public.messages;
CREATE POLICY "Users see own messages" ON public.messages 
FOR ALL USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- 13. Disputes: Strict ownership
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own disputes" ON public.disputes;
CREATE POLICY "Users see own disputes" ON public.disputes 
FOR ALL USING (auth.uid() = reporter_id);

-- 14. Storage: Prevent directory traversal and unauthorized access
DROP POLICY IF EXISTS "Avatar user upload" ON storage.objects;
CREATE POLICY "Avatar user upload" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Avatar user update" ON storage.objects;
CREATE POLICY "Avatar user update" ON storage.objects 
FOR UPDATE USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Property img upload" ON storage.objects;
CREATE POLICY "Property img upload" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'property-images' AND auth.role() = 'authenticated');

-- 15. Final Schema Refresh
NOTIFY pgrst, 'reload schema';
