-- escrow_transactions.status had a default of 'pending' and no CHECK, so any text was accepted.
-- Every writer in the app starts a row at 'awaiting_payment' (start_property_escrow_payment and
-- trigger_initialize_escrow), then moves it to funded -> released or refunded.
--
-- Changes: the default now matches what every writer uses, and the column accepts only the
-- known values. 'pending' stays allowed because account_deletion_blockers still reads it.
-- Production had 0 escrow rows when this was written (9 Nov 2026), so no existing row can fail.
-- Rollback: ALTER TABLE public.escrow_transactions DROP CONSTRAINT escrow_transactions_status_check;
--           ALTER TABLE public.escrow_transactions ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.escrow_transactions ALTER COLUMN status SET DEFAULT 'awaiting_payment';

ALTER TABLE public.escrow_transactions
  ADD CONSTRAINT escrow_transactions_status_check
  CHECK (status IN ('awaiting_payment', 'funded', 'released', 'refunded', 'pending'));
