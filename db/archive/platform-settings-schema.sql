-- ============================================================
-- DealMatch - Platform Settings (admin-editable, key-value)
-- Run in Supabase SQL Editor
--
-- Purpose: lets the superadmin edit values like social media
-- links from the admin panel instead of hardcoding them in
-- source files. Add new settings by inserting new keys - no
-- schema change needed for future settings.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text PRIMARY KEY,
  value       text,
  label       text,        -- human-readable name shown in admin UI
  category    text DEFAULT 'general',
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Anyone (including signed-out visitors) can READ settings -
-- the public site needs to render the live social links.
DROP POLICY IF EXISTS "Anyone can view settings" ON public.platform_settings;
CREATE POLICY "Anyone can view settings"
  ON public.platform_settings FOR SELECT
  USING (true);

-- Only the superadmin emails can write settings.
-- Adjust the email list here if your superadmin accounts change.
DROP POLICY IF EXISTS "Superadmin can update settings" ON public.platform_settings;
CREATE POLICY "Superadmin can update settings"
  ON public.platform_settings FOR UPDATE
  USING (auth.jwt() ->> 'email' IN ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com'));

DROP POLICY IF EXISTS "Superadmin can insert settings" ON public.platform_settings;
CREATE POLICY "Superadmin can insert settings"
  ON public.platform_settings FOR INSERT
  WITH CHECK (auth.jwt() ->> 'email' IN ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com'));

-- Seed the social media links with empty values - the superadmin
-- fills these in from the admin Settings page once real accounts exist.
INSERT INTO public.platform_settings (key, value, label, category) VALUES
  ('social_facebook',  '', 'Facebook URL',  'social'),
  ('social_instagram', '', 'Instagram URL', 'social'),
  ('social_twitter',   '', 'X (Twitter) URL', 'social'),
  ('social_linkedin',  '', 'LinkedIn URL',  'social'),
  ('whatsapp_number',  '2347057392060', 'WhatsApp Business Number', 'contact'),
  ('support_email',    '', 'Support Email', 'contact')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Bank Account Details (DealMatch's own business bank account)
-- SENSITIVE - readable only by admin/staff, never public.
-- This is where large transactions, escrow funds, or manual
-- settlements land - NOT the same as a user's own bank account
-- in profiles.account_number (used for referral payouts to users).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bank_details (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name       text NOT NULL,
  account_name    text NOT NULL,
  account_number  text NOT NULL,
  account_type    text DEFAULT 'business' CHECK (account_type IN ('business','domiciliary')),
  currency        text DEFAULT 'NGN' CHECK (currency IN ('NGN','USD')),
  is_active       boolean DEFAULT true,
  is_primary      boolean DEFAULT false,
  notes           text,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;

-- Only signed-in admin/staff roles can view bank details - never public.
DROP POLICY IF EXISTS "Staff can view bank details" ON public.bank_details;
CREATE POLICY "Staff can view bank details"
  ON public.bank_details FOR SELECT
  USING (
    auth.jwt() ->> 'email' IN ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','agent','senior_agent','regional_coordinator')
    )
  );

DROP POLICY IF EXISTS "Superadmin can manage bank details" ON public.bank_details;
CREATE POLICY "Superadmin can manage bank details"
  ON public.bank_details FOR ALL
  USING (auth.jwt() ->> 'email' IN ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com'))
  WITH CHECK (auth.jwt() ->> 'email' IN ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com'));

-- ============================================================
-- Crypto Wallets (replaces hardcoded CRYPTO_WALLETS in
-- src/lib/crypto-payment.js)
-- PUBLIC READ - any logged-in user paying via crypto needs to
-- see the wallet address to send funds to. Write restricted to
-- superadmin only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crypto_wallets (
  id          text PRIMARY KEY,        -- e.g. 'USDT_TRC20', matches existing CRYPTO_WALLETS keys
  coin        text NOT NULL,           -- USDT, USDC
  network     text NOT NULL,           -- human label e.g. 'TRON (TRC20)'
  address     text NOT NULL DEFAULT '',
  icon        text DEFAULT '💰',
  color       text DEFAULT '#888888',
  fee_label   text DEFAULT '',         -- human label e.g. '~$0.10 network fee'
  fee_fixed   numeric DEFAULT 0,       -- USD fee added to charge
  confirm_label text DEFAULT '',       -- e.g. '~3 min confirmation'
  recommended boolean DEFAULT false,
  is_active   boolean DEFAULT true,
  sort_order  int DEFAULT 0,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.crypto_wallets ENABLE ROW LEVEL SECURITY;

-- Public read - wallet addresses must be visible to any user
-- making a crypto payment, same as the old hardcoded version.
DROP POLICY IF EXISTS "Anyone can view active crypto wallets" ON public.crypto_wallets;
CREATE POLICY "Anyone can view active crypto wallets"
  ON public.crypto_wallets FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Superadmin can manage crypto wallets" ON public.crypto_wallets;
CREATE POLICY "Superadmin can manage crypto wallets"
  ON public.crypto_wallets FOR ALL
  USING (auth.jwt() ->> 'email' IN ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com'))
  WITH CHECK (auth.jwt() ->> 'email' IN ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com'));

-- Seed the same 8 wallet/network combinations that existed in the
-- old hardcoded CRYPTO_WALLETS object, with empty addresses.
-- The superadmin fills in real addresses from the admin Settings page.
INSERT INTO public.crypto_wallets (id, coin, network, address, icon, color, fee_label, fee_fixed, confirm_label, recommended, sort_order) VALUES
  ('USDT_TRC20',   'USDT', 'TRON (TRC20)',            '', '🟢', '#26A17B', '$0.00 - near zero fees', 0,    '~1 min confirmation', true,  1),
  ('USDC_TRC20',   'USDC', 'TRON (TRC20)',            '', '🔵', '#2775CA', '$0.00 - near zero fees', 0,    '~1 min confirmation', false, 2),
  ('USDT_BEP20',   'USDT', 'BNB Smart Chain (BEP20)', '', '🟡', '#F3BA2F', '~$0.10 network fee',     0.10, '~3 min confirmation', false, 3),
  ('USDC_BEP20',   'USDC', 'BNB Smart Chain (BEP20)', '', '🔵', '#2775CA', '~$0.10 network fee',     0.10, '~3 min confirmation', false, 4),
  ('USDT_POLYGON', 'USDT', 'Polygon (Matic)',         '', '🟣', '#8247E5', '~$0.01 network fee',     0.01, '~2 min confirmation', false, 5),
  ('USDC_POLYGON', 'USDC', 'Polygon (Matic)',         '', '🔵', '#2775CA', '~$0.01 network fee',     0.01, '~2 min confirmation', false, 6),
  ('USDT_ERC20',   'USDT', 'Ethereum (ERC20)',        '', '⚡', '#627EEA', '~$2-15 gas fee',         5,    '~5 min confirmation', false, 7),
  ('USDC_ERC20',   'USDC', 'Ethereum (ERC20)',        '', '⚡', '#2775CA', '~$2-15 gas fee',         5,    '~5 min confirmation', false, 8)
ON CONFLICT (id) DO NOTHING;
