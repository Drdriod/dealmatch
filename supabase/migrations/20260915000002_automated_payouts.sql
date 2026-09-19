-- Item 8 of the fix request: automated provider payouts.
--
-- release_held_payment() (20260909000004) stopped after writing a 'held'
-- ledger row, with a literal:
--   -- TODO Phase 2b: call the confirmed gateway release endpoint here
-- Money never actually left the platform on its own; a provider was paid
-- only if someone manually ran a transfer outside the app.
--
-- This migration wires the missing half using a queue table rather than
-- calling out to an HTTP endpoint directly from Postgres (no dependency on
-- pg_net being enabled, and it gives a durable, retryable, admin-visible
-- record of every payout attempt):
--
--   release_held_payment()  -->  INSERT INTO payout_queue (status='pending')
--   api/platform.js's cron-process-payouts resource (Vercel Cron, every
--     10 minutes) picks up pending rows, creates a Paystack transfer
--     recipient if needed, initiates the transfer, marks the row
--     'processing' with the transfer's gateway reference
--   api/paystack-webhook.js's transfer.success/transfer.failed cases
--     (previously just console.log) now find the row by gateway_ref and
--     mark it 'paid' or 'failed', writing the final commission_wallet_ledger
--     'released' entry only once the gateway actually confirms.
--
-- Also adds bank_code to payout_accounts: Paystack's transfer-recipient
-- API needs the bank's Paystack code, not its display name, so this was a
-- prerequisite gap - PayoutSetupPage.jsx is updated in the same pass to
-- collect it from a real bank list instead of free text.

begin;

do $$ begin
  create type public.payout_queue_status as enum ('pending','processing','paid','failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.payout_queue (
  id                bigserial primary key,
  transaction_id    bigint not null references public.transactions(id),
  profile_id        uuid not null references auth.users(id) on delete cascade,
  payout_account_id uuid references public.payout_accounts(id),
  amount_cents      bigint not null check (amount_cents > 0),
  status            public.payout_queue_status not null default 'pending',
  gateway_ref       text, -- Paystack transfer_code once initiated; matched against transfer.success/failed webhooks
  attempts          integer not null default 0,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  processed_at      timestamptz
);

create index if not exists idx_payout_queue_status on public.payout_queue(status, created_at);
create unique index if not exists idx_payout_queue_one_per_transaction on public.payout_queue(transaction_id);

comment on table public.payout_queue is
  'Durable queue between release_held_payment() and the actual Paystack '
  'transfer. One row per transaction that has been dual-confirmed and is '
  'ready to pay out. Processed by api/platform.js (resource=cron-process-payouts), '
  'finalized by api/paystack-webhook.js on transfer.success/transfer.failed.';

alter table public.payout_queue enable row level security;

drop policy if exists payout_queue_select_own on public.payout_queue;
create policy payout_queue_select_own on public.payout_queue
  for select using (auth.uid() = profile_id or public.is_admin());

-- No direct insert/update policy for regular users: rows are only ever
-- written by release_held_payment() (SECURITY DEFINER) and the
-- service-role cron processor / webhook handler.
drop policy if exists payout_queue_admin_write on public.payout_queue;
create policy payout_queue_admin_write on public.payout_queue
  for all using (public.is_admin()) with check (public.is_admin());

-- Transactions: track payout state alongside the existing escrow status.
alter table public.transactions
  add column if not exists payout_status text default 'not_queued' check (payout_status in ('not_queued','queued','paid','failed')),
  add column if not exists payout_ref    text,
  add column if not exists paid_out_at   timestamptz;

-- payout_accounts: the Paystack bank code, required to create a transfer
-- recipient. Nullable for now so existing rows aren't invalidated, but
-- the cron processor refuses to pay out a row with no bank_code (see
-- comment inline there) rather than guessing.
alter table public.payout_accounts
  add column if not exists bank_code text;

-- ── release_held_payment(): now actually queues the payout ────────────────
CREATE OR REPLACE FUNCTION public.release_held_payment(p_transaction_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx     public.transactions%ROWTYPE;
  v_amount BIGINT;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND OR v_tx.provider_id IS NULL THEN
    RETURN;
  END IF;

  v_amount := COALESCE(v_tx.amount_cents, 0) - COALESCE(v_tx.commission_amount_cents, 0);
  IF v_amount <= 0 THEN
    RETURN; -- nothing owed to the provider (e.g. fee >= amount, shouldn't happen but never queue a non-positive payout)
  END IF;

  INSERT INTO public.commission_wallet_ledger (profile_id, transaction_id, entry_type, amount_cents)
  VALUES (v_tx.provider_id, v_tx.id, 'held', v_amount);

  -- Queue the real payout. provider_payout_account_id was locked in at
  -- accept_bid() time, so this always points at the account that was
  -- verified when the deal was struck, not whatever the provider's
  -- current payout_accounts row happens to be.
  INSERT INTO public.payout_queue (transaction_id, profile_id, payout_account_id, amount_cents)
  VALUES (v_tx.id, v_tx.provider_id, v_tx.provider_payout_account_id, v_amount)
  ON CONFLICT (transaction_id) DO NOTHING; -- release_held_payment can in principle be called more than once for the same tx; never double-queue

  UPDATE public.transactions SET payout_status = 'queued' WHERE id = v_tx.id;
END;
$$;

-- ── submit_payout_account(): now also takes bank_code ──────────────────────
CREATE OR REPLACE FUNCTION public.submit_payout_account(
  p_bank_name TEXT,
  p_account_number TEXT,
  p_account_name TEXT,
  p_bank_code TEXT DEFAULT NULL,
  p_gateway public.payout_gateway DEFAULT 'paystack'
) RETURNS public.payout_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payout_accounts%ROWTYPE;
BEGIN
  IF COALESCE(TRIM(p_bank_name), '') = '' OR COALESCE(TRIM(p_account_number), '') = '' OR COALESCE(TRIM(p_account_name), '') = '' THEN
    RAISE EXCEPTION 'bank name, account number and account name are all required';
  END IF;

  DELETE FROM public.payout_accounts WHERE profile_id = auth.uid() AND status = 'pending';

  INSERT INTO public.payout_accounts (profile_id, gateway, bank_name, bank_code, account_number, account_name, status)
  VALUES (auth.uid(), p_gateway, TRIM(p_bank_name), NULLIF(TRIM(p_bank_code), ''), TRIM(p_account_number), TRIM(p_account_name), 'pending')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payout_account(TEXT, TEXT, TEXT, TEXT, public.payout_gateway) TO authenticated;

commit;
