-- ═══════════════════════════════════════════════════════════════
-- DealMatch v1.4 — Security RLS Hardening
-- Run this AFTER admin-features-migration.sql
-- Fixes 5 RLS vulnerabilities found in security audit
-- ═══════════════════════════════════════════════════════════════

-- Helper: reusable admin check (avoids repeating subquery everywhere)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR email = 'divineandbassey@gmail.com')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin','agent')
  ) OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email = 'divineandbassey@gmail.com'
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- FIX 1: properties — admin must be able to SELECT all statuses
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read active properties" ON public.properties;
DROP POLICY IF EXISTS "Sellers manage own properties" ON public.properties;
DROP POLICY IF EXISTS "Admins manage all properties"  ON public.properties;

CREATE POLICY "Public read active properties" ON public.properties
  FOR SELECT USING (
    status = 'active'
    OR auth.uid() = seller_id
    OR public.is_staff()
  );
CREATE POLICY "Sellers manage own properties" ON public.properties
  FOR ALL USING (auth.uid() = seller_id);
CREATE POLICY "Admins manage all properties"  ON public.properties
  FOR ALL USING (public.is_staff());

-- ─────────────────────────────────────────────────────────────
-- FIX 2: payments — remove USING(true) (full public read)
-- Only service role (backend) or the owner should read payments
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages payments" ON public.payments;

CREATE POLICY "Users view own payments"      ON public.payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all payments"     ON public.payments
  FOR SELECT USING (public.is_staff());
CREATE POLICY "Service role inserts payments" ON public.payments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins update payments"       ON public.payments
  FOR UPDATE USING (public.is_staff());

-- ─────────────────────────────────────────────────────────────
-- FIX 3: bookings — require auth to create (stops unauthenticated spam)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can create bookings"  ON public.bookings;
DROP POLICY IF EXISTS "Owners can view bookings"    ON public.bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can update bookings"  ON public.bookings;

CREATE POLICY "Auth users can create bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Guests view own bookings" ON public.bookings
  FOR SELECT USING (
    auth.uid() = user_id
    OR property_id IN (SELECT id FROM public.properties WHERE seller_id = auth.uid())
    OR public.is_staff()
  );

CREATE POLICY "Admins update bookings" ON public.bookings
  FOR UPDATE USING (public.is_staff());

-- ─────────────────────────────────────────────────────────────
-- FIX 4: crypto_payments — require auth to submit
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can submit crypto"  ON public.crypto_payments;
DROP POLICY IF EXISTS "Users view own payments"   ON public.crypto_payments;

CREATE POLICY "Auth users submit crypto"    ON public.crypto_payments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users view own crypto"       ON public.crypto_payments
  FOR SELECT USING (
    auth.uid()::text = user_id::text
    OR public.is_staff()
  );

CREATE POLICY "Admins update crypto"        ON public.crypto_payments
  FOR UPDATE USING (public.is_staff());

-- ─────────────────────────────────────────────────────────────
-- FIX 5: profiles — fix the SELECT policy for admin
--   The old policy only allows id = auth.uid().
--   The admin-features-migration added a second policy but it
--   may conflict. Drop all and rewrite cleanly.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile"    ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles"  ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

CREATE POLICY "Users view own profile"  ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_staff());

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR public.is_staff());

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- FIX 6: disputes — require auth to file a dispute
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'disputes' AND policyname = 'Anyone can file disputes'
  ) THEN
    DROP POLICY "Anyone can file disputes" ON public.disputes;
  END IF;
END$$;

DROP POLICY IF EXISTS "Anyone can file dispute"  ON public.disputes;
DROP POLICY IF EXISTS "Users view own disputes"  ON public.disputes;

CREATE POLICY "Auth users file disputes" ON public.disputes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users view relevant disputes" ON public.disputes
  FOR SELECT USING (
    auth.uid() = reporter_id
    OR property_id IN (SELECT id FROM public.properties WHERE seller_id = auth.uid())
    OR public.is_staff()
  );

CREATE POLICY "Admins resolve disputes" ON public.disputes
  FOR UPDATE USING (public.is_staff());

-- ─────────────────────────────────────────────────────────────
-- Grant execute on helper functions to authenticated role
-- ─────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.is_admin()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_booking_availability(uuid, date, date, int, uuid) TO authenticated, anon;
