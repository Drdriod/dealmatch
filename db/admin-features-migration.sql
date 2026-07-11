-- ═══════════════════════════════════════════════════════════════
-- DealMatch v1.4 — Admin Features Migration
-- Run this AFTER your existing schema
-- ═══════════════════════════════════════════════════════════════

-- 1. Add identity verification columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_verification_status text DEFAULT 'unverified'
    CHECK (identity_verification_status IN ('unverified','submitted','approved','rejected')),
  ADD COLUMN IF NOT EXISTS identity_verified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS identity_rejection_note text,
  ADD COLUMN IF NOT EXISTS identity_verified_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Storage URLs written by VerifyIdentityPage, read by Admin identity tab
  ADD COLUMN IF NOT EXISTS identity_photo_url      text,
  ADD COLUMN IF NOT EXISTS identity_selfie_url     text,
  ADD COLUMN IF NOT EXISTS identity_doc_type       text;

-- 2. Ensure bookings table has status + checkin_status columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS status        text DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','checked_in','checked_out','cancelled','no_show')),
  ADD COLUMN IF NOT EXISTS checkin_at    timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_at   timestamptz,
  ADD COLUMN IF NOT EXISTS admin_note    text,
  ADD COLUMN IF NOT EXISTS user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Clash-prevention function: returns true if rooms available for date range
CREATE OR REPLACE FUNCTION public.check_booking_availability(
  p_property_id uuid,
  p_checkin     date,
  p_checkout    date,
  p_rooms       int DEFAULT 1,
  p_category_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_available int;
  v_booked    int;
BEGIN
  -- Get available rooms for the category or property default
  IF p_category_id IS NOT NULL THEN
    SELECT available_rooms INTO v_available
      FROM public.room_categories
     WHERE id = p_category_id AND is_active = true;
  ELSE
    SELECT COALESCE(SUM(available_rooms), 0) INTO v_available
      FROM public.room_categories
     WHERE property_id = p_property_id AND is_active = true;
  END IF;

  IF v_available IS NULL THEN v_available := 0; END IF;

  -- Count overlapping confirmed bookings
  SELECT COALESCE(SUM(rooms_booked), 0) INTO v_booked
    FROM public.bookings
   WHERE property_id = p_property_id
     AND status NOT IN ('cancelled','no_show')
     AND checkin_date < p_checkout
     AND checkout_date > p_checkin
     AND (p_category_id IS NULL OR category_id = p_category_id);

  RETURN (v_available - v_booked) >= p_rooms;
END;
$$;

-- 4. Admin policies: admin role can read everything
-- Bookings: admin can view all
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
CREATE POLICY "Admins can view all bookings" ON public.bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Bookings: admin can update (check-in/out)
DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
CREATE POLICY "Admins can update bookings" ON public.bookings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Profiles: admin can view all
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Profiles: admin can update (for identity verification)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5. Index for fast identity queue lookups
CREATE INDEX IF NOT EXISTS idx_profiles_identity_status
  ON public.profiles(identity_verification_status)
  WHERE identity_verification_status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_bookings_status_checkin
  ON public.bookings(status, checkin_date);

-- 6. Promote admin account (replace with your actual admin user id if needed)
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'divineandbassey@gmail.com';
