-- Crypto payments are ON HOLD while DealMatch confirms they meet Nigerian
-- regulation and compliance requirements. The UI hides/disables the option
-- (src/lib/features.js); this migration is the safety net so an old cached
-- client or a direct API call cannot create a crypto payment either.
--
-- The service role (server webhooks, admin tooling) keeps full access.
--
-- TO RE-ENABLE once cleared:
--   grant insert on public.crypto_payments to authenticated;
-- and set CRYPTO_PAYMENTS_ENABLED = true in src/lib/features.js.

revoke insert on public.crypto_payments from anon, authenticated;
