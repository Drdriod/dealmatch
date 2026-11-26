-- VAT on/off test for the job-release path. Run on STAGING only; always rolls back.
-- Final message "VAT_ON_OFF_TESTS_PASSED" = all checks passed; anything else = a failure.
-- Covers release_held_payment with VAT OFF (no VAT, no tax_ledger row, payout = price - commission),
-- VAT ON (VAT = 7.5% of the commission held back, one tax_ledger row, payout reduced by it),
-- a repeat release adds no second tax row, and get_tax_rate follows the switch.
-- Needs the tax_settings, tax_ledger and release_held_payment versions from migrations
-- 20261120000000 and 20261120020000.
DO $test$
DECLARE
  v_req uuid := gen_random_uuid();
  v_pro uuid := gen_random_uuid();
  v_t1 bigint; v_t2 bigint;
  v_q bigint; v_n integer; v_vat bigint;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_req), (v_pro);
  INSERT INTO public.profiles (id) VALUES (v_req), (v_pro) ON CONFLICT (id) DO NOTHING;

  ALTER TABLE public.transactions DISABLE TRIGGER USER;
  INSERT INTO public.transactions (model, requester_id, provider_id, amount_cents, commission_amount_cents)
  VALUES ('SEALED', v_req, v_pro, 1000000, 30000) RETURNING id INTO v_t1;   -- N10,000 job, 3% commission
  INSERT INTO public.transactions (model, requester_id, provider_id, amount_cents, commission_amount_cents)
  VALUES ('SEALED', v_req, v_pro, 1000000, 30000) RETURNING id INTO v_t2;
  ALTER TABLE public.transactions ENABLE TRIGGER USER;

  -- VAT OFF
  UPDATE public.tax_settings SET is_active = false WHERE key = 'vat';
  IF public.get_tax_rate('vat') <> 0 THEN RAISE EXCEPTION 'FAIL: rate should be 0 when VAT is off'; END IF;
  PERFORM public.release_held_payment(v_t1);
  SELECT amount_cents INTO v_q FROM public.payout_queue WHERE transaction_id = v_t1;
  IF v_q IS DISTINCT FROM 970000 THEN RAISE EXCEPTION 'FAIL off: payout should be 970000, got %', v_q; END IF;
  SELECT count(*) INTO v_n FROM public.tax_ledger WHERE reference = 'tx:' || v_t1;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL off: no tax row expected, got %', v_n; END IF;

  -- VAT ON
  UPDATE public.tax_settings SET is_active = true, rate_pct = 7.5 WHERE key = 'vat';
  IF public.get_tax_rate('vat') <> 7.5 THEN RAISE EXCEPTION 'FAIL: rate should be 7.5 when VAT is on'; END IF;
  PERFORM public.release_held_payment(v_t2);
  SELECT amount_cents INTO v_q FROM public.payout_queue WHERE transaction_id = v_t2;
  IF v_q IS DISTINCT FROM 967750 THEN RAISE EXCEPTION 'FAIL on: payout should be 967750 (10000.00 - 300.00 - 22.50 VAT), got %', v_q; END IF;
  SELECT tax_kobo INTO v_vat FROM public.tax_ledger WHERE reference = 'tx:' || v_t2 AND kind = 'vat';
  IF v_vat IS DISTINCT FROM 2250 THEN RAISE EXCEPTION 'FAIL on: tax row should be 2250 kobo, got %', v_vat; END IF;

  -- Repeat release: still one tax row.
  BEGIN PERFORM public.release_held_payment(v_t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT count(*) INTO v_n FROM public.tax_ledger WHERE reference = 'tx:' || v_t2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL repeat: expected exactly 1 tax row, got %', v_n; END IF;

  RAISE EXCEPTION 'VAT_ON_OFF_TESTS_PASSED (rolled back on purpose)';
END
$test$;
