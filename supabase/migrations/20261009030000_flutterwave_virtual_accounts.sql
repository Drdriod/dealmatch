-- Flutterwave V4 collections via dynamic virtual accounts (October 2026).
--
-- One row per payment attempt. The payer is shown a DealMatch account number,
-- transfers from their bank app, and the webhook matches the credit back to
-- this row by account number. Only the webhook (service role) sets paid
-- state; clients can read their own rows and nothing else.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.payment_virtual_accounts (
  reference          text PRIMARY KEY,
  profile_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email              text NOT NULL,
  customer_id        text,
  virtual_account_id text,
  account_number     text NOT NULL,
  bank_name          text,
  expected_kobo      bigint NOT NULL CHECK (expected_kobo > 0),
  paid_kobo          bigint,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'underpaid', 'expired')),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at         timestamptz,
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- A credit is matched to its payment by account number, so it must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS payment_virtual_accounts_account_number_idx
  ON public.payment_virtual_accounts (account_number);

ALTER TABLE public.payment_virtual_accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_virtual_accounts FROM anon, authenticated;
GRANT SELECT ON public.payment_virtual_accounts TO authenticated;

DROP POLICY IF EXISTS "Payer reads own virtual accounts" ON public.payment_virtual_accounts;
CREATE POLICY "Payer reads own virtual accounts"
  ON public.payment_virtual_accounts
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());
