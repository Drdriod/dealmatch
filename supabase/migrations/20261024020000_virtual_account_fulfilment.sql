-- Virtual-account payments: make a delivery retry-safe.
-- Backlog: design-patterns.md item 10 (Virtual-account payments are not retry-safe).
-- Rule: rolled-back dry run first (change the last line to ROLLBACK), then the owner applies.
--
-- Before this change the account was marked paid before the purpose handler ran. If the handler
-- failed, the retry found a paid account and put the whole transfer on the refund list instead of
-- granting the item. After it, "paid" and "fulfilled" are two facts:
--   status = 'paid'          the full price has arrived
--   fulfilled_at is not null the item was granted (or the money was put on the refund list)
-- A paid account that is not fulfilled is an unfinished delivery that the webhook retry, the
-- "I have paid" button and the background job can all finish, one at a time (a short lease).
--
-- Also records which gateway charges were already counted, so a retried webhook for a short
-- payment is not added to the running total twice.
--
-- Idempotent. Touches only payment_virtual_accounts.

begin;

alter table public.payment_virtual_accounts
  add column if not exists completing_charge_id text,
  add column if not exists counted_charge_ids text[] not null default '{}',
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfilment_claimed_at timestamptz,
  add column if not exists fulfilment_error text,
  add column if not exists last_verify_at timestamptz;

-- Rows that were paid before this change and have a payments row did finish. Rows with no
-- payments row are the unfinished ones this fix exists for: they stay open.
update public.payment_virtual_accounts v
set fulfilled_at = coalesce(v.paid_at, now())
where v.status = 'paid'
  and v.fulfilled_at is null
  and exists (select 1 from public.payments p where p.reference = v.reference);

-- The background job looks for paid rows that are not fulfilled, and for open rows to scan.
create index if not exists payment_virtual_accounts_unfulfilled_idx
  on public.payment_virtual_accounts (paid_at)
  where status = 'paid' and fulfilled_at is null;

create index if not exists payment_virtual_accounts_open_idx
  on public.payment_virtual_accounts (created_at)
  where status in ('pending', 'underpaid', 'expired');

-- Clients still read their own row only (existing policy). Nothing new is granted to them:
-- the new columns are written by the service role alone.

commit;
