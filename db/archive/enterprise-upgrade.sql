-- ═══════════════════════════════════════════════════════════════════════════
-- DealMatch Enterprise Upgrade SQL
-- Revenue splits, ledger, idempotency, auto-release triggers, checkin tokens
-- Run AFTER agent-accountability.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. EXTEND escrow_transactions ────────────────────────────────────────
ALTER TABLE public.escrow_transactions
  ADD COLUMN IF NOT EXISTS transaction_type    text DEFAULT 'rental'
    CHECK (transaction_type IN ('rental','sale','hotel')),
  ADD COLUMN IF NOT EXISTS buyer_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_id           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referrer_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gross_amount        numeric,
  ADD COLUMN IF NOT EXISTS platform_pct        numeric,
  ADD COLUMN IF NOT EXISTS platform_amount     numeric,
  ADD COLUMN IF NOT EXISTS agent_pct           numeric,
  ADD COLUMN IF NOT EXISTS agent_payout        numeric,
  ADD COLUMN IF NOT EXISTS referral_pct        numeric,
  ADD COLUMN IF NOT EXISTS referral_payout     numeric,
  ADD COLUMN IF NOT EXISTS landlord_receives   numeric,
  ADD COLUMN IF NOT EXISTS fee_from_tenant     numeric,
  ADD COLUMN IF NOT EXISTS fee_from_landlord   numeric,
  ADD COLUMN IF NOT EXISTS move_in_date        date,
  ADD COLUMN IF NOT EXISTS confirmed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS auto_release_at     timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_filed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_token       text,
  ADD COLUMN IF NOT EXISTS token_validated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deed_buyer_url      text,
  ADD COLUMN IF NOT EXISTS deed_seller_url     text,
  ADD COLUMN IF NOT EXISTS deed_verified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key     text UNIQUE,
  ADD COLUMN IF NOT EXISTS payout_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_locked       boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_escrow_type      ON public.escrow_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_escrow_auto_rel  ON public.escrow_transactions (auto_release_at)
  WHERE status = 'funded';
CREATE INDEX IF NOT EXISTS idx_escrow_idem      ON public.escrow_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- ─── 2. WALLET LEDGER (immutable double-entry) ────────────────────────────
-- Every money movement writes a ledger row - never mutated, only appended
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id       uuid NOT NULL REFERENCES public.escrow_transactions(id),
  recipient_id    uuid NOT NULL REFERENCES public.profiles(id),
  recipient_role  text NOT NULL
    CHECK (recipient_role IN ('platform','agent','referrer','landlord','seller','hotel_owner','refund')),
  amount          numeric(15,2) NOT NULL CHECK (amount > 0),
  currency        text NOT NULL DEFAULT 'NGN',
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','failed')),
  reference       text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz
);

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Ledger: recipient reads own" ON public.wallet_ledger;
  CREATE POLICY "Ledger: recipient reads own" ON public.wallet_ledger
    FOR SELECT USING (
      recipient_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

-- No UPDATE or DELETE on ledger - immutable
REVOKE UPDATE, DELETE ON public.wallet_ledger FROM authenticated;


-- ─── 3. CHECKIN TOKENS TABLE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checkin_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id    uuid NOT NULL REFERENCES public.escrow_transactions(id) ON DELETE CASCADE,
  property_id  uuid REFERENCES public.properties(id),
  guest_id     uuid REFERENCES public.profiles(id),
  token        text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  validated_at timestamptz,
  validated_by uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checkin_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Token: guest reads own" ON public.checkin_tokens;
  CREATE POLICY "Token: guest reads own" ON public.checkin_tokens
    FOR SELECT USING (
      guest_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin','agent')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;


-- ─── 4. DEED SUBMISSIONS TABLE (for property sales OCR) ──────────────────
CREATE TABLE IF NOT EXISTS public.deed_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id       uuid NOT NULL REFERENCES public.escrow_transactions(id) ON DELETE CASCADE,
  property_id     uuid REFERENCES public.properties(id),
  submitted_by    uuid NOT NULL REFERENCES public.profiles(id),
  party_role      text NOT NULL CHECK (party_role IN ('buyer','seller')),
  document_path   text NOT NULL,
  extracted_name  text,
  extracted_plot  text,
  has_legal_stamp boolean DEFAULT false,
  verified        boolean DEFAULT false,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deed_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Deed: parties access" ON public.deed_submissions;
  CREATE POLICY "Deed: parties access" ON public.deed_submissions
    FOR ALL USING (
      submitted_by = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    )
    WITH CHECK (submitted_by = auth.uid());
END $$;


-- ─── 5. REVENUE SPLIT FUNCTION (atomic, row-locked) ──────────────────────
-- Called after escrow is funded. Calculates splits per transaction type.
-- Uses SELECT FOR UPDATE to prevent race conditions.

CREATE OR REPLACE FUNCTION public.fn_calculate_revenue_split(
  p_escrow_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  esc         public.escrow_transactions%ROWTYPE;
  plat_amt    numeric;
  agent_amt   numeric;
  ref_amt     numeric;
  owner_amt   numeric;
  ref_id      uuid;
BEGIN
  -- Lock the row to prevent concurrent execution
  SELECT * INTO esc
  FROM public.escrow_transactions
  WHERE id = p_escrow_id
  FOR UPDATE;

  -- Guard: only process once
  IF esc.payout_locked THEN
    RAISE EXCEPTION 'Payout already processed for escrow %', p_escrow_id;
  END IF;

  -- Mark as locked immediately
  UPDATE public.escrow_transactions
  SET payout_locked = true
  WHERE id = p_escrow_id;

  -- ── RENTAL: 7.5% total (3.75% each side) ──────────────────
  IF esc.transaction_type = 'rental' THEN
    -- Total fee pool = gross * 0.075
    -- Split: 65% platform, 25% agent, 10% referrer
    plat_amt  := ROUND(esc.gross_amount * 0.075 * 0.65, 2);
    agent_amt := ROUND(esc.gross_amount * 0.075 * 0.25, 2);
    ref_amt   := ROUND(esc.gross_amount * 0.075 * 0.10, 2);
    owner_amt := esc.gross_amount - ROUND(esc.gross_amount * 0.0375, 2); -- landlord net

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.075,
      platform_amount   = plat_amt,
      agent_pct         = 0.25,
      agent_payout      = agent_amt,
      referral_pct      = 0.10,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt,
      fee_from_tenant   = ROUND(esc.gross_amount * 0.0375, 2),
      fee_from_landlord = ROUND(esc.gross_amount * 0.0375, 2)
    WHERE id = p_escrow_id;

  -- ── SALE: 3.0% total (1.5% each side) ──────────────────────
  ELSIF esc.transaction_type = 'sale' THEN
    plat_amt  := ROUND(esc.gross_amount * 0.030 * 0.60, 2);
    agent_amt := ROUND(esc.gross_amount * 0.030 * 0.30, 2);
    ref_amt   := ROUND(esc.gross_amount * 0.030 * 0.10, 2);
    owner_amt := esc.gross_amount - ROUND(esc.gross_amount * 0.015, 2); -- seller net

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.030,
      platform_amount   = plat_amt,
      agent_pct         = 0.30,
      agent_payout      = agent_amt,
      referral_pct      = 0.10,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt,
      fee_from_tenant   = ROUND(esc.gross_amount * 0.015, 2),
      fee_from_landlord = ROUND(esc.gross_amount * 0.015, 2)
    WHERE id = p_escrow_id;

  -- ── HOTEL: 12% commission built into price ──────────────────
  ELSIF esc.transaction_type = 'hotel' THEN
    plat_amt  := ROUND(esc.gross_amount * 0.10, 2);  -- 10% platform
    ref_amt   := ROUND(esc.gross_amount * 0.02, 2);  -- 2% referrer
    owner_amt := esc.gross_amount - plat_amt - ref_amt; -- 88% hotel owner

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.10,
      platform_amount   = plat_amt,
      agent_pct         = 0,
      agent_payout      = 0,
      referral_pct      = 0.02,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt
    WHERE id = p_escrow_id;
  END IF;

  -- Re-fetch updated row
  SELECT * INTO esc FROM public.escrow_transactions WHERE id = p_escrow_id;

  -- Get referrer id from property's seller referral tracking
  SELECT p.referred_by INTO ref_id
  FROM public.properties pr
  JOIN public.profiles p ON p.id = pr.seller_id
  WHERE pr.id = esc.property_id
  LIMIT 1;

  -- Write immutable ledger entries
  -- Platform
  INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
  SELECT p_escrow_id, id, 'platform', esc.platform_amount,
    'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-PLT'
  FROM public.profiles
  WHERE email IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
  LIMIT 1;

  -- Agent
  IF esc.agent_id IS NOT NULL AND esc.agent_payout > 0 THEN
    INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
    VALUES (p_escrow_id, esc.agent_id, 'agent', esc.agent_payout,
      'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-AGT');
  END IF;

  -- Referrer
  IF ref_id IS NOT NULL AND esc.referral_payout > 0 THEN
    INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
    VALUES (p_escrow_id, ref_id,
      CASE esc.transaction_type WHEN 'hotel' THEN 'referrer' ELSE 'referrer' END,
      esc.referral_payout,
      'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-REF');
  END IF;

  -- Owner / Landlord / Seller / Hotel
  DECLARE
    owner_uid uuid := COALESCE(esc.seller_id,
      (SELECT seller_id FROM public.properties WHERE id = esc.property_id LIMIT 1));
  BEGIN
    IF owner_uid IS NOT NULL THEN
      INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
      VALUES (p_escrow_id, owner_uid,
        CASE esc.transaction_type
          WHEN 'rental' THEN 'landlord'
          WHEN 'sale'   THEN 'seller'
          ELSE 'hotel_owner'
        END,
        esc.landlord_receives,
        'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-OWN');
    END IF;
  END;

  -- Mark split complete
  UPDATE public.escrow_transactions
  SET payout_processed_at = now()
  WHERE id = p_escrow_id;

END;
$$;


-- ─── 6. 72-HOUR AUTO-RELEASE TRIGGER (rentals) ───────────────────────────
-- Sets auto_release_at when move_in_date is set
-- A cron job or pg_cron can call fn_auto_release_check() daily

CREATE OR REPLACE FUNCTION public.fn_set_auto_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.move_in_date IS NOT NULL AND NEW.status = 'funded'
     AND NEW.transaction_type = 'rental' THEN
    NEW.auto_release_at := (NEW.move_in_date::timestamptz + interval '72 hours');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_auto_release ON public.escrow_transactions;
CREATE TRIGGER trg_set_auto_release
  BEFORE INSERT OR UPDATE OF move_in_date ON public.escrow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_auto_release();


-- Auto-release function (called by pg_cron daily at 06:00 WAT)
CREATE OR REPLACE FUNCTION public.fn_auto_release_expired_escrows()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  released integer := 0;
  esc_row  public.escrow_transactions%ROWTYPE;
BEGIN
  FOR esc_row IN
    SELECT * FROM public.escrow_transactions
    WHERE status = 'funded'
      AND transaction_type = 'rental'
      AND auto_release_at IS NOT NULL
      AND auto_release_at <= now()
      AND dispute_filed_at IS NULL
      AND confirmed_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.escrow_transactions
    SET status = 'released', released_at = now()
    WHERE id = esc_row.id;

    -- Write audit entry
    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES ('escrow_auto_released_72h',
      jsonb_build_object('escrow_id', esc_row.id, 'property_id', esc_row.property_id),
      NULL);

    -- Trigger payout split
    PERFORM public.fn_calculate_revenue_split(esc_row.id);

    released := released + 1;
  END LOOP;
  RETURN released;
END;
$$;


-- ─── 7. MOVE-IN CONFIRM TRIGGER ──────────────────────────────────────────
-- When tenant sets confirmed_at → release escrow immediately
CREATE OR REPLACE FUNCTION public.fn_release_on_move_in_confirm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL
     AND NEW.transaction_type = 'rental' AND NEW.status = 'funded'
     AND NEW.dispute_filed_at IS NULL THEN
    NEW.status      := 'released';
    NEW.released_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_on_confirm ON public.escrow_transactions;
CREATE TRIGGER trg_release_on_confirm
  BEFORE UPDATE OF confirmed_at ON public.escrow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_release_on_move_in_confirm();

-- After release → calculate payout splits
CREATE OR REPLACE FUNCTION public.fn_post_release_split()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'released' AND OLD.status <> 'released'
     AND NOT NEW.payout_locked THEN
    PERFORM public.fn_calculate_revenue_split(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_release_split ON public.escrow_transactions;
CREATE TRIGGER trg_post_release_split
  AFTER UPDATE OF status ON public.escrow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_post_release_split();


-- ─── 8. DEED VERIFICATION TRIGGER (sales) ────────────────────────────────
-- When both buyer and seller deeds are uploaded → check match → release
CREATE OR REPLACE FUNCTION public.fn_check_deed_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  buyer_deed  public.deed_submissions%ROWTYPE;
  seller_deed public.deed_submissions%ROWTYPE;
BEGIN
  SELECT * INTO buyer_deed  FROM public.deed_submissions
  WHERE escrow_id = NEW.escrow_id AND party_role = 'buyer'  LIMIT 1;
  SELECT * INTO seller_deed FROM public.deed_submissions
  WHERE escrow_id = NEW.escrow_id AND party_role = 'seller' LIMIT 1;

  -- Both submitted - attempt auto-verify (basic metadata match)
  IF buyer_deed.id IS NOT NULL AND seller_deed.id IS NOT NULL THEN
    -- In production: call OCR edge function here
    -- For now: mark deed_verified_at and release if both have legal stamp
    IF buyer_deed.has_legal_stamp AND seller_deed.has_legal_stamp THEN
      UPDATE public.escrow_transactions
      SET deed_verified_at = now(),
          deed_buyer_url   = buyer_deed.document_path,
          deed_seller_url  = seller_deed.document_path,
          status           = 'released',
          released_at      = now()
      WHERE id = NEW.escrow_id AND status = 'funded';

      INSERT INTO public.admin_audit_log (action, metadata)
      VALUES ('deed_auto_verified',
        jsonb_build_object('escrow_id', NEW.escrow_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_deed_completion ON public.deed_submissions;
CREATE TRIGGER trg_check_deed_completion
  AFTER INSERT OR UPDATE OF has_legal_stamp ON public.deed_submissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_deed_completion();


-- ─── 9. CHECKIN TOKEN GENERATOR ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_generate_checkin_token(
  p_escrow_id uuid,
  p_guest_id  uuid,
  p_property_id uuid
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  token text;
BEGIN
  -- Generate 6-digit numeric token
  token := lpad(floor(random() * 1000000)::text, 6, '0');

  INSERT INTO public.checkin_tokens
    (escrow_id, property_id, guest_id, token, expires_at)
  VALUES
    (p_escrow_id, p_property_id, p_guest_id, token, now() + interval '24 hours');

  -- Store on escrow record too
  UPDATE public.escrow_transactions
  SET checkin_token = token
  WHERE id = p_escrow_id;

  RETURN token;
END;
$$;


-- Token validation + morning-after release trigger
CREATE OR REPLACE FUNCTION public.fn_validate_checkin_token(
  p_token      text,
  p_validator  uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  tok public.checkin_tokens%ROWTYPE;
BEGIN
  SELECT * INTO tok FROM public.checkin_tokens
  WHERE token = p_token AND expires_at > now() AND validated_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Invalid or expired token');
  END IF;

  -- Mark validated
  UPDATE public.checkin_tokens
  SET validated_at = now(), validated_by = p_validator
  WHERE id = tok.id;

  UPDATE public.escrow_transactions
  SET token_validated_at = now()
  WHERE id = tok.escrow_id;

  -- Schedule release for next morning 06:00
  UPDATE public.escrow_transactions
  SET auto_release_at = date_trunc('day', now() + interval '1 day') + interval '6 hours'
  WHERE id = tok.escrow_id AND status = 'funded';

  RETURN jsonb_build_object(
    'success', true,
    'escrow_id', tok.escrow_id,
    'release_at', date_trunc('day', now() + interval '1 day') + interval '6 hours'
  );
END;
$$;


-- ─── 10. INPUT SANITIZATION FUNCTION ─────────────────────────────────────
-- Strip XSS and SQL injection attempts from text fields
CREATE OR REPLACE FUNCTION public.fn_sanitize_text(input text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  -- Remove script tags, SQL comment sequences, null bytes
  input := regexp_replace(input, '<[^>]+>', '', 'g');
  input := regexp_replace(input, '--', '', 'g');
  input := regexp_replace(input, chr(0), '', 'g');
  input := regexp_replace(input, '(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC)\s', '', 'gi');
  RETURN trim(input);
END;
$$;

-- Apply sanitization trigger to properties
CREATE OR REPLACE FUNCTION public.fn_sanitize_property_inputs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.title       := public.fn_sanitize_text(COALESCE(NEW.title, ''));
  NEW.description := public.fn_sanitize_text(COALESCE(NEW.description, ''));
  NEW.address     := public.fn_sanitize_text(COALESCE(NEW.address, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_property ON public.properties;
CREATE TRIGGER trg_sanitize_property
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.fn_sanitize_property_inputs();


-- ─── 11. STRICT RLS - HORIZONTAL PRIVILEGE ESCALATION PREVENTION ─────────
-- Ensure no user can read another user's private data

-- escrow_transactions: tenant OR buyer OR seller can see their own
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users view own escrow"   ON public.escrow_transactions;
  DROP POLICY IF EXISTS "Escrow select"           ON public.escrow_transactions;
  DROP POLICY IF EXISTS "Owner or admin reads escrow" ON public.escrow_transactions;

  CREATE POLICY "Escrow strict select" ON public.escrow_transactions
    FOR SELECT USING (
      tenant_id  = auth.uid()
      OR buyer_id  = auth.uid()
      OR seller_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin','lender')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );

  CREATE POLICY "Escrow strict update" ON public.escrow_transactions
    FOR UPDATE
    USING (
      -- Tenant can confirm move-in only
      (tenant_id = auth.uid() AND status = 'funded')
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    )
    WITH CHECK (
      (tenant_id = auth.uid() AND status = 'funded')
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

-- Profiles: ensure no cross-user reads of sensitive fields
DO $$ BEGIN
  DROP POLICY IF EXISTS "Profile select" ON public.profiles;
  CREATE POLICY "Profile select" ON public.profiles
    FOR SELECT USING (
      auth.uid() = id
      OR public.get_my_role() IN ('admin','verifier','superadmin','agent')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
      -- Public fields only for non-staff - enforced at app level via column select
    );
END $$;


-- ─── 12. pg_cron SETUP (if extension available) ──────────────────────────
-- Runs auto-release check every day at 06:00 WAT (05:00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'dealmatch-auto-release',
      '0 5 * * *',
      'SELECT public.fn_auto_release_expired_escrows()'
    );
  END IF;
END;
$$;

-- ─── DONE ─────────────────────────────────────────────────────────────────
-- Summary of what this script creates:
-- Tables:    wallet_ledger, checkin_tokens, deed_submissions
-- Columns:   15 new columns on escrow_transactions
-- Functions: fn_calculate_revenue_split (row-locked, idempotent)
--            fn_auto_release_expired_escrows (72h passive timeout)
--            fn_generate_checkin_token / fn_validate_checkin_token
--            fn_sanitize_text + property trigger
-- Triggers:  trg_set_auto_release, trg_release_on_confirm,
--            trg_post_release_split, trg_check_deed_completion,
--            trg_sanitize_property
-- RLS:       Strict horizontal isolation on escrow + profiles
