-- Payment gateway: Flutterwave replaces Paystack (October 2026).
-- Run after 20261009020000_flutterwave_gateway_enum.sql.
-- Idempotent.

-- New payout accounts default to Flutterwave.
ALTER TABLE public.payout_accounts ALTER COLUMN gateway SET DEFAULT 'flutterwave'::public.payout_gateway;

-- submit_payout_account / automated payout functions take a p_gateway
-- argument whose default was 'paystack'. Rewrite those defaults in place
-- so the function signatures and grants stay exactly as they are.
DO $$
DECLARE
  r record;
  v_new text;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%DEFAULT ''paystack''%'
  LOOP
    v_new := replace(r.def, 'DEFAULT ''paystack''', 'DEFAULT ''flutterwave''');
    EXECUTE v_new;
    RAISE NOTICE 'gateway default updated: %', r.sig;
  END LOOP;
END $$;
