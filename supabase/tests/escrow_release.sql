-- Escrow release regression test. Run on STAGING only (never production): it inserts test rows
-- and then ALWAYS rolls back by raising an exception at the end. Read the final message:
--   "ESCROW_RELEASE_TESTS_PASSED" = all checks passed; any other message = a failure.
-- Covers: (1) manual/trigger release no longer fails on profiles.referred_by,
--         (2) auto-release no longer double-calls the split,
--         (3) the payout lock still blocks a second split,
--         (4) fee numbers are unchanged (rental pool split 65/25/10, landlord pays half the fee).
DO $test$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_ref   uuid := gen_random_uuid();
  v_prop  uuid;
  v_e1    uuid;
  v_e2    uuid;
  v_n     integer;
  v_row   public.escrow_transactions%ROWTYPE;
  v_pool  numeric;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_admin), (v_owner), (v_agent), (v_ref);
  INSERT INTO public.profiles (id) VALUES (v_admin), (v_owner), (v_agent), (v_ref) ON CONFLICT (id) DO NOTHING;
  -- Profile guards reset role and invited_by for ordinary writers, so switch user triggers off
  -- for these two fixture updates only (rolled back with everything else).
  ALTER TABLE public.profiles DISABLE TRIGGER USER;
  UPDATE public.profiles SET role = 'superadmin' WHERE id = v_admin;
  UPDATE public.profiles SET invited_by = v_ref WHERE id = v_owner;
  ALTER TABLE public.profiles ENABLE TRIGGER USER;

  INSERT INTO public.properties (title, price, state, city, seller_id)
  VALUES ('escrow test', 100000, 'Akwa Ibom', 'Uyo', v_owner) RETURNING id INTO v_prop;

  -- (1) Release through the status change (this is what the manual and move-in paths do).
  INSERT INTO public.escrow_transactions (property_id, seller_id, agent_id, status, transaction_type, gross_amount)
  VALUES (v_prop, v_owner, v_agent, 'funded', 'rental', 100000) RETURNING id INTO v_e1;
  UPDATE public.escrow_transactions SET status = 'released', released_at = now() WHERE id = v_e1;

  SELECT * INTO v_row FROM public.escrow_transactions WHERE id = v_e1;
  IF NOT v_row.payout_locked OR v_row.payout_processed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 1: release did not complete the split';
  END IF;
  v_pool := ROUND(v_row.gross_amount * v_row.platform_pct, 2);
  IF v_row.platform_amount <> ROUND(v_pool * 0.65, 2) OR v_row.agent_payout <> ROUND(v_pool * 0.25, 2)
     OR v_row.referral_payout <> ROUND(v_pool * 0.10, 2) THEN
    RAISE EXCEPTION 'FAIL 4: rental split numbers changed (platform %, agent %, referral %)',
      v_row.platform_amount, v_row.agent_payout, v_row.referral_payout;
  END IF;
  IF v_row.landlord_receives <> v_row.gross_amount - ROUND(v_row.gross_amount * v_row.platform_pct / 2, 2) THEN
    RAISE EXCEPTION 'FAIL 4: landlord_receives changed';
  END IF;
  SELECT count(*) INTO v_n FROM public.wallet_ledger WHERE escrow_id = v_e1 AND recipient_role IN ('platform','agent','referrer','landlord');
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL 1: expected 4 ledger rows (platform, agent, referrer, landlord), got %', v_n; END IF;

  -- (3) A second split must still be refused.
  BEGIN
    PERFORM public.fn_calculate_revenue_split(v_e1);
    RAISE EXCEPTION 'FAIL 3: second split was not refused';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Payout already processed%' THEN RAISE; END IF;
  END;

  -- (2) Auto-release path, 72h expired.
  INSERT INTO public.escrow_transactions (property_id, seller_id, agent_id, status, transaction_type, gross_amount)
  VALUES (v_prop, v_owner, v_agent, 'funded', 'rental', 50000) RETURNING id INTO v_e2;
  UPDATE public.escrow_transactions SET auto_release_at = now() - interval '1 hour' WHERE id = v_e2;
  v_n := public.fn_auto_release_expired_escrows();
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL 2: auto-release released nothing'; END IF;
  SELECT * INTO v_row FROM public.escrow_transactions WHERE id = v_e2;
  IF v_row.status <> 'released' OR NOT v_row.payout_locked OR v_row.payout_processed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 2: auto-release did not complete (status %, locked %)', v_row.status, v_row.payout_locked;
  END IF;
  SELECT count(*) INTO v_n FROM public.wallet_ledger WHERE escrow_id = v_e2;
  IF v_n < 3 THEN RAISE EXCEPTION 'FAIL 2: expected ledger rows after auto-release, got %', v_n; END IF;

  RAISE EXCEPTION 'ESCROW_RELEASE_TESTS_PASSED (rolled back on purpose)';
END
$test$;
