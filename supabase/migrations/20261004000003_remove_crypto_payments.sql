-- Crypto payments have been removed from DealMatch (code, UI, admin tools).
--
-- This migration closes the database side WITHOUT deleting data:
--   * existing crypto_payments rows are financial history and are kept
--   * no client (anon / authenticated) can read or write either table any more
--   * wallet addresses are cleared and the wallets switched off
--   * the service role (server-side) keeps access, e.g. for exports and audits
--
-- Safe to run more than once.

revoke all on public.crypto_payments from anon, authenticated;
revoke all on public.crypto_wallets  from anon, authenticated;

-- Wallet destinations were publicly readable ("Anyone can view active crypto wallets").
drop policy if exists "Anyone can view active crypto wallets" on public.crypto_wallets;

update public.crypto_wallets
   set address = '',
       is_active = false,
       updated_at = now();

-- OPTIONAL, LATER: once you have exported any crypto_payments history you need to
-- keep for accounting or audit, the tables can be dropped for good:
--   drop table if exists public.crypto_payments;
--   drop table if exists public.crypto_wallets;
