-- ─────────────────────────────────────────────────────────────
-- DealMatch Referral & Loyalty Points Schema (SAFE / IDEMPOTENT)
-- Run this in Supabase SQL Editor
-- Safe to re-run even if tables already exist from a previous session.
-- ─────────────────────────────────────────────────────────────

-- Add missing columns to profiles
-- invite_code and invited_by may already exist - safe with IF NOT EXISTS
-- bank_name, account_number, account_name already exist in live DB - skipped
-- role already exists in live DB with its own CHECK - do NOT touch it
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_code    text UNIQUE,
  ADD COLUMN IF NOT EXISTS invited_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_level int  DEFAULT 0;

-- ─────────────────────────────────────────────────────────────
-- referral_transactions: create if new, patch columns if existing
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_transactions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.referral_transactions
  ADD COLUMN IF NOT EXISTS buyer_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_id   uuid,
  ADD COLUMN IF NOT EXISTS transaction_type text,
  ADD COLUMN IF NOT EXISTS dm_commission    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_level   int,
  ADD COLUMN IF NOT EXISTS payout_type      text,
  ADD COLUMN IF NOT EXISTS referral_earning numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_awarded   int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_redeemed  int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status           text    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payout_ref       text,
  ADD COLUMN IF NOT EXISTS paid_at          timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_transactions_payout_type_check'
  ) THEN
    ALTER TABLE public.referral_transactions
      ADD CONSTRAINT referral_transactions_payout_type_check
      CHECK (payout_type IN ('cash','points','points_redemption'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_transactions_status_check'
  ) THEN
    ALTER TABLE public.referral_transactions
      ADD CONSTRAINT referral_transactions_status_check
      CHECK (status IN ('pending','confirmed','paid_out','cancelled'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- loyalty_points
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_points (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.loyalty_points
  ADD COLUMN IF NOT EXISTS points_balance  int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_lifetime int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_redeemed int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_points_user_id_key'
  ) THEN
    ALTER TABLE public.loyalty_points
      ADD CONSTRAINT loyalty_points_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- agent_payments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_payments (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_payments
  ADD COLUMN IF NOT EXISTS property_id  uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS amount       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status       text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_at      timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_payments_payment_type_check'
  ) THEN
    ALTER TABLE public.agent_payments
      ADD CONSTRAINT agent_payments_payment_type_check
      CHECK (payment_type IN ('field_verification','senior_override'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_payments_status_check'
  ) THEN
    ALTER TABLE public.agent_payments
      ADD CONSTRAINT agent_payments_status_check
      CHECK (status IN ('pending','paid','cancelled'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.referral_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_points        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_payments        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own referral transactions" ON public.referral_transactions;
CREATE POLICY "Users view own referral transactions"
  ON public.referral_transactions FOR SELECT
  USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "System can insert referral transactions" ON public.referral_transactions;
CREATE POLICY "System can insert referral transactions"
  ON public.referral_transactions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users view own points" ON public.loyalty_points;
CREATE POLICY "Users view own points"
  ON public.loyalty_points FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System manages points" ON public.loyalty_points;
CREATE POLICY "System manages points"
  ON public.loyalty_points FOR ALL
  WITH CHECK (true);

DROP POLICY IF EXISTS "Agents view own payments" ON public.agent_payments;
CREATE POLICY "Agents view own payments"
  ON public.agent_payments FOR SELECT
  USING (auth.uid() = agent_id);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_referral_txns_referrer ON public.referral_transactions(referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_txns_buyer    ON public.referral_transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_referral_txns_type     ON public.referral_transactions(payout_type, status);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_user    ON public.loyalty_points(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_invite_code   ON public.profiles(invite_code);
CREATE INDEX IF NOT EXISTS idx_profiles_invited_by    ON public.profiles(invited_by);
CREATE INDEX IF NOT EXISTS idx_agent_payments_agent   ON public.agent_payments(agent_id, status);
