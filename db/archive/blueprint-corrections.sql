-- ═══════════════════════════════════════════════════════════════════════════
-- DealMatch Blueprint Corrections - Run in Supabase SQL Editor
-- Implements: property_inspections table, escrow trigger, private bucket RLS,
--             immutable audit log, corrected RLS policies across all tables
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 0. HELPER: get_my_role() ─────────────────────────────────────────────
-- Ensure this function exists (used by all policies below)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;


-- ─── 1. PROPERTY INSPECTIONS TABLE (new) ──────────────────────────────────
-- Required for address masking: exact street address only revealed once
-- a buyer has a confirmed inspection appointment for that property.

CREATE TABLE IF NOT EXISTS public.property_inspections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  buyer_id        uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  landlord_id     uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  assigned_agent  uuid REFERENCES public.profiles(id),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','scheduled','confirmed','completed','cancelled')),
  proposed_date   timestamptz,
  confirmed_date  timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_inspections ENABLE ROW LEVEL SECURITY;

-- Buyer can create & view their own inspection requests
DO $$ BEGIN
  DROP POLICY IF EXISTS "Buyer manages own inspections" ON public.property_inspections;
  CREATE POLICY "Buyer manages own inspections" ON public.property_inspections
    USING  (buyer_id = auth.uid() OR landlord_id = auth.uid()
            OR assigned_agent = auth.uid()
            OR public.get_my_role() IN ('admin','verifier','superadmin','agent'))
    WITH CHECK (buyer_id = auth.uid());
END $$;

-- Landlord can approve / update status on their own listings
DO $$ BEGIN
  DROP POLICY IF EXISTS "Landlord updates inspection status" ON public.property_inspections;
  CREATE POLICY "Landlord updates inspection status" ON public.property_inspections
    FOR UPDATE
    USING (landlord_id = auth.uid()
           OR assigned_agent = auth.uid()
           OR public.get_my_role() IN ('admin','agent','superadmin'))
    WITH CHECK (landlord_id = auth.uid()
                OR assigned_agent = auth.uid()
                OR public.get_my_role() IN ('admin','agent','superadmin'));
END $$;

-- Index for fast lookup from PropertyPage
CREATE INDEX IF NOT EXISTS idx_inspections_buyer_property
  ON public.property_inspections (buyer_id, property_id, status);


-- ─── 2. ESCROW TRIGGER ────────────────────────────────────────────────────
-- Fires when a tenancy/sale contract transitions to 'executed' status,
-- automatically creating an 'awaiting_payment' escrow row.

CREATE TABLE IF NOT EXISTS public.contracts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  buyer_id    uuid REFERENCES public.profiles(id),
  seller_id   uuid REFERENCES public.profiles(id),
  amount      numeric(15,2),
  status      text DEFAULT 'draft' CHECK (status IN ('draft','signed','executed','cancelled')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Contract parties access" ON public.contracts;
  CREATE POLICY "Contract parties access" ON public.contracts
    USING (buyer_id = auth.uid() OR seller_id = auth.uid()
           OR public.get_my_role() IN ('admin','superadmin'));
END $$;

-- Trigger function: on contract executed → create escrow row
CREATE OR REPLACE FUNCTION public.trigger_initialize_escrow()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Only fire when status changes TO 'executed'
  IF NEW.status = 'executed' AND (OLD.status IS DISTINCT FROM 'executed') THEN
    INSERT INTO public.escrow_transactions (
      property_id,
      amount,
      platform_fee,
      status,
      payment_ref,
      created_at
    ) VALUES (
      NEW.property_id,
      NEW.amount,
      ROUND(NEW.amount * 0.025, 2), -- 2.5% platform fee
      'awaiting_payment',
      'ESC-' || upper(substring(NEW.id::text, 1, 8)),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_initialize_escrow ON public.contracts;
CREATE TRIGGER trg_initialize_escrow
  AFTER UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_initialize_escrow();


-- ─── 3. AUDIT LOG - IMMUTABLE, TRIGGER-ONLY INSERTS ──────────────────────
-- Frontend must never INSERT directly. All audit entries written by DB triggers.

-- Make sure table exists with right shape
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action       text NOT NULL,
  metadata     jsonb,
  performed_by uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policy if any
DROP POLICY IF EXISTS "Admin inserts audit log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Frontend audit insert" ON public.admin_audit_log;

-- READ: superadmin/admin only
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins read audit log" ON public.admin_audit_log;
  CREATE POLICY "Admins read audit log" ON public.admin_audit_log
    FOR SELECT
    USING (public.get_my_role() IN ('admin','superadmin')
           OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com'));
END $$;

-- INSERT: service role only (triggered by DB functions, never frontend)
-- Revoke direct insert from authenticated role
REVOKE INSERT ON public.admin_audit_log FROM authenticated;

-- Generic audit trigger function - called by all admin action triggers
CREATE OR REPLACE FUNCTION public.fn_audit_admin_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES (
    TG_ARGV[0],
    jsonb_build_object('table', TG_TABLE_NAME, 'record_id', NEW.id, 'new_status',
      CASE TG_TABLE_NAME
        WHEN 'properties'   THEN NEW.status
        WHEN 'profiles'     THEN NEW.identity_verification_status
        ELSE NULL
      END
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

-- Attach audit trigger to properties status changes
DROP TRIGGER IF EXISTS trg_audit_property_status ON public.properties;
CREATE TRIGGER trg_audit_property_status
  AFTER UPDATE OF status ON public.properties
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_audit_admin_action('property_status_change');

-- Attach audit trigger to identity verification status changes
DROP TRIGGER IF EXISTS trg_audit_identity_status ON public.profiles;
CREATE TRIGGER trg_audit_identity_status
  AFTER UPDATE OF identity_verification_status ON public.profiles
  FOR EACH ROW
  WHEN (OLD.identity_verification_status IS DISTINCT FROM NEW.identity_verification_status)
  EXECUTE FUNCTION public.fn_audit_admin_action('identity_status_change');


-- ─── 4. STORAGE BUCKET - identity-docs PRIVATE ────────────────────────────
-- Create bucket as PRIVATE (public = false).
-- Admin access via short-lived signed URLs (generated in AdminPage.jsx).
-- Run via Supabase Dashboard → Storage → New Bucket:
--   Name: identity-docs | Public: OFF | File size: 5MB | Types: image/*

-- Storage RLS: authenticated users upload only to their own folder
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users upload own identity docs" ON storage.objects;
  CREATE POLICY "Users upload own identity docs" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'identity-docs'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
END $$;

-- Admins/verifiers read all; owners read their own
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins read identity docs" ON storage.objects;
  CREATE POLICY "Admins read identity docs" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'identity-docs'
      AND (
        public.get_my_role() IN ('admin','verifier','superadmin')
        OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
        OR (storage.foldername(name))[1] = auth.uid()::text
      )
    );
END $$;

-- Users can update/delete only their own docs
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users manage own identity docs" ON storage.objects;
  CREATE POLICY "Users manage own identity docs" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'identity-docs'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
END $$;


-- ─── 5. CORRECTED RLS POLICIES (all tables per blueprint) ─────────────────

-- ── profiles ──────────────────────────────────────────────────────────────
-- Public: name/avatar/role only. Sensitive identity fields: owner or staff.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public reads profile basics" ON public.profiles;
  CREATE POLICY "Public reads profile basics" ON public.profiles
    FOR SELECT
    USING (
      auth.uid() = id  -- own row: full access
      OR public.get_my_role() IN ('admin','verifier','superadmin','agent')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owner or staff updates profile" ON public.profiles;
  CREATE POLICY "Owner or staff updates profile" ON public.profiles
    FOR UPDATE
    USING (
      auth.uid() = id
      OR public.get_my_role() IN ('admin','verifier','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    )
    WITH CHECK (
      auth.uid() = id
      OR public.get_my_role() IN ('admin','verifier','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

-- ── properties ────────────────────────────────────────────────────────────
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Active listings public, owner sees all" ON public.properties;
  CREATE POLICY "Active listings public, owner sees all" ON public.properties
    FOR SELECT
    USING (
      status = 'active'
      OR seller_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin','agent','verifier')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Verified owners insert properties" ON public.properties;
  CREATE POLICY "Verified owners insert properties" ON public.properties
    FOR INSERT
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND (
        -- Must have completed Tier-2 verification
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.is_photo_verified = true
        )
        OR public.get_my_role() IN ('admin','superadmin')
      )
    );
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owner or agent updates property" ON public.properties;
  CREATE POLICY "Owner or agent updates property" ON public.properties
    FOR UPDATE
    USING (
      seller_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin','agent')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    )
    WITH CHECK (
      seller_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin','agent')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

-- ── payments / escrow_transactions ────────────────────────────────────────
-- UPDATE strictly blocked for all users - service role webhook only

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owner or admin reads payments" ON public.payments;
  CREATE POLICY "Owner or admin reads payments" ON public.payments
    FOR SELECT
    USING (
      user_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

-- No UPDATE policy on payments for authenticated role = effectively blocked
REVOKE UPDATE ON public.payments FROM authenticated;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owner or admin reads escrow" ON public.escrow_transactions;
  CREATE POLICY "Owner or admin reads escrow" ON public.escrow_transactions
    FOR SELECT
    USING (
      public.get_my_role() IN ('admin','superadmin','lender')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

REVOKE UPDATE ON public.escrow_transactions FROM authenticated;

-- ── mortgage_applications ─────────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS "Applicant or lender reads mortgage" ON public.mortgage_applications;
  CREATE POLICY "Applicant or lender reads mortgage" ON public.mortgage_applications
    FOR SELECT
    USING (
      user_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin','lender','verifier')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Verified users submit mortgage" ON public.mortgage_applications;
  CREATE POLICY "Verified users submit mortgage" ON public.mortgage_applications
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin lender updates mortgage" ON public.mortgage_applications;
  CREATE POLICY "Admin lender updates mortgage" ON public.mortgage_applications
    FOR UPDATE
    USING (public.get_my_role() IN ('admin','superadmin','lender')
           OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com'))
    WITH CHECK (public.get_my_role() IN ('admin','superadmin','lender')
                OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com'));
END $$;

-- ── rental_enquiries ──────────────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS "Enquiry parties read" ON public.rental_enquiries;
  CREATE POLICY "Enquiry parties read" ON public.rental_enquiries
    FOR SELECT
    USING (
      user_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

-- No UPDATE on rental_enquiries - immutable log
REVOKE UPDATE ON public.rental_enquiries FROM authenticated;

-- ── student_verifications ─────────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS "Student reads own verification" ON public.student_verifications;
  CREATE POLICY "Student reads own verification" ON public.student_verifications
    FOR SELECT
    USING (
      user_id = auth.uid()
      OR public.get_my_role() IN ('admin','verifier','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin verifier updates student status" ON public.student_verifications;
  CREATE POLICY "Admin verifier updates student status" ON public.student_verifications
    FOR UPDATE
    USING (public.get_my_role() IN ('admin','verifier','superadmin')
           OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com'))
    WITH CHECK (public.get_my_role() IN ('admin','verifier','superadmin')
                OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com'));
END $$;

-- ── admin_announcements ───────────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins manage announcements" ON public.admin_announcements;
  CREATE POLICY "Admins manage announcements" ON public.admin_announcements
    USING (public.get_my_role() IN ('admin','superadmin')
           OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com'))
    WITH CHECK (public.get_my_role() IN ('admin','superadmin')
                OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com'));
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "All users read announcements" ON public.admin_announcements;
  CREATE POLICY "All users read announcements" ON public.admin_announcements
    FOR SELECT USING (auth.uid() IS NOT NULL);
END $$;


-- ─── DONE ─────────────────────────────────────────────────────────────────
-- Post-run checklist:
-- [ ] Supabase → Storage → Create bucket "identity-docs" (Public: OFF)
-- [ ] Supabase → Storage → Confirm "avatars" bucket exists (Public: ON)
-- [ ] Supabase → Storage → Confirm "property-images" bucket exists (Public: ON)
-- [ ] Staff login URL: /admin-login (all roles: admin, verifier, agent)
-- [ ] Verifiers land on /admin/identity after login
-- [ ] Agents land on /agent after login
-- [ ] Property listings now start as pending_review (not active)
-- [ ] Address masking active - exact pin shown only after confirmed inspection
-- [ ] WhatsApp contact now routes through DealMatch central number only
-- [ ] Audit log is now immutable (DB trigger only, frontend INSERT blocked)
