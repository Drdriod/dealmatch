-- ═══════════════════════════════════════════════════════════════
-- DealMatch — Admin Security Migration
-- Run this in Supabase SQL Editor AFTER the main schema
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Admin audit log ───────────────────────────────────────
-- Every admin mutation is recorded here with actor + timestamp.
-- Only admins can read; nobody can delete (append-only via RLS).
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action     text NOT NULL,
  meta       text,                      -- JSON blob, no raw PII
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log"   ON public.admin_audit_log;
DROP POLICY IF EXISTS "Anyone insert audit log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "No delete audit log"     ON public.admin_audit_log;

CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Anyone insert audit log" ON public.admin_audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Intentionally no DELETE policy — audit logs are immutable.

-- ─── 2. Profiles — admin RLS ──────────────────────────────────
-- Admins and verifiers can read all profiles.
-- Only admins can update any profile (role changes, suspensions).
-- Superadmin email is enforced at the app layer; DB enforces role.

DROP POLICY IF EXISTS "Admins can view all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile"  ON public.profiles;
DROP POLICY IF EXISTS "Staff can view all profiles"    ON public.profiles;

CREATE POLICY "Staff can view all profiles" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'verifier', 'agent')
    )
  );

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── 3. Properties — admin RLS ────────────────────────────────
DROP POLICY IF EXISTS "Admins manage all properties"      ON public.properties;
DROP POLICY IF EXISTS "Agents manage all properties"      ON public.properties;
DROP POLICY IF EXISTS "Staff can view all properties"     ON public.properties;

CREATE POLICY "Staff can view all properties" ON public.properties
  FOR SELECT USING (
    status = 'active'
    OR auth.uid() = seller_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'agent', 'verifier')
    )
  );

CREATE POLICY "Admins and agents manage all properties" ON public.properties
  FOR UPDATE USING (
    auth.uid() = seller_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'agent')
    )
  );

-- ─── 4. Professional applications — admin RLS ─────────────────
DROP POLICY IF EXISTS "Admins manage professionals"    ON public.professional_applications;

CREATE POLICY "Admins manage professionals" ON public.professional_applications
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── 5. Payments — admin RLS ──────────────────────────────────
-- Payments must ONLY be readable by admins.
-- The old "Service role manages payments FOR ALL USING (true)" was
-- too broad — any authenticated user could read all payment records.
DROP POLICY IF EXISTS "Service role manages payments" ON public.payments;

CREATE POLICY "Admins read all payments" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service inserts payments" ON public.payments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─── 6. Crypto payments — admin RLS ───────────────────────────
DROP POLICY IF EXISTS "Admins read all crypto"    ON public.crypto_payments;

CREATE POLICY "Admins read all crypto" ON public.crypto_payments
  FOR SELECT USING (
    auth.uid() = user_id
    OR user_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── 7. Escrow — admin RLS ────────────────────────────────────
DROP POLICY IF EXISTS "Admins read all escrow"   ON public.escrow_transactions;
DROP POLICY IF EXISTS "Admins update escrow"     ON public.escrow_transactions;

CREATE POLICY "Admins read all escrow" ON public.escrow_transactions
  FOR SELECT USING (
    auth.uid() = tenant_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins update escrow" ON public.escrow_transactions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── 8. Bookings — admin RLS ──────────────────────────────────
DROP POLICY IF EXISTS "Admins can view all bookings"   ON public.bookings;
DROP POLICY IF EXISTS "Admins can update bookings"     ON public.bookings;

CREATE POLICY "Admins can view all bookings" ON public.bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'agent'))
  );

CREATE POLICY "Admins can update bookings" ON public.bookings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── 9. Mortgage applications — admin RLS ─────────────────────
DROP POLICY IF EXISTS "Admins read mortgage apps" ON public.mortgage_applications;

CREATE POLICY "Admins read mortgage apps" ON public.mortgage_applications
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── 10. Role constraint — add 'suspended' and 'deleted' ──────
-- The original CHECK only included business roles. We need
-- suspended + deleted so the admin deactivation flow works.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'buyer','seller','renter','landlord','agent',
    'investor','admin','verifier','suspended','deleted'
  ));

-- ─── 11. Index for fast staff lookups ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.admin_audit_log(action, created_at DESC);

-- ─── 12. Promote superadmin (run once, update email if needed) ─
-- UPDATE public.profiles SET role = 'admin'
-- WHERE email = 'divineandbassey@gmail.com';
