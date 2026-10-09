-- Payment gateway: Flutterwave replaces Paystack (October 2026).
--
-- Adds 'flutterwave' to the payout_gateway enum. The 'paystack' value is
-- deliberately KEPT: existing payout_accounts and commission_wallet_ledger
-- rows reference it, and Postgres cannot drop an enum value that is in use.
-- New rows are written with 'flutterwave' only.
--
-- Kept in its own file: ADD VALUE cannot be used in the same transaction
-- as a statement that uses the new value (see the next migration).

ALTER TYPE public.payout_gateway ADD VALUE IF NOT EXISTS 'flutterwave';
