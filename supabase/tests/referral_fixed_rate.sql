-- Referral fixed-rate test. Run on STAGING only (never production): inserts test rows and ALWAYS
-- rolls back by raising an exception at the end. Final message "REFERRAL_FIXED_RATE_TESTS_PASSED"
-- means every check passed; anything else is a failure.
-- Needs migrations 20261120010000 (referral engine v2) and 20261123130000 (fixed 5%, off) applied.
DO $test$
DECLARE
  v_ref uuid := gen_random_uuid(); v_l1 uuid := gen_random_uuid();
  v_l2 uuid := gen_random_uuid();  v_l3 uuid := gen_random_uuid(); v_new uuid := gen_random_uuid();
  v_n int; v_row public.referral_transactions%ROWTYPE; v_credits int;
BEGIN
  IF public.ref_setting('l1_pct') <> 5 OR public.ref_setting('l2_pct') <> 0 OR public.ref_setting('l3_pct') <> 0
     OR public.ref_setting('program_enabled') <> 0 OR public.ref_setting('activation_credits') <> 0
     OR public.ref_setting('small_deal_naira') <> 0 THEN
    RAISE EXCEPTION 'FAIL settings: expected l1 5, l2 0, l3 0, programme off, no credits';
  END IF;

  INSERT INTO auth.users (id) VALUES (v_ref), (v_l1), (v_l2), (v_l3);
  INSERT INTO public.profiles (id) VALUES (v_ref), (v_l1), (v_l2), (v_l3) ON CONFLICT (id) DO NOTHING;
  ALTER TABLE public.profiles DISABLE TRIGGER USER;
  UPDATE public.profiles SET invited_by = v_l1 WHERE id = v_ref;
  UPDATE public.profiles SET invited_by = v_l2 WHERE id = v_l1;
  UPDATE public.profiles SET invited_by = v_l3 WHERE id = v_l2;
  UPDATE public.profiles SET identity_verification_status = 'approved' WHERE id = v_ref;
  ALTER TABLE public.profiles ENABLE TRIGGER USER;

  -- Programme OFF: nothing is recorded.
  v_n := public.record_referral_rewards('t-off', v_ref, 'escrow', 10000, 100000, ARRAY[v_ref]);
  IF v_n <> 0 OR (SELECT count(*) FROM public.referral_transactions WHERE payment_id = 't-off') <> 0 THEN
    RAISE EXCEPTION 'FAIL off: programme off must record nothing';
  END IF;

  -- Switch on for the rest of the test (rolled back).
  UPDATE public.referral_settings SET value = 1 WHERE key = 'program_enabled';

  -- One fixed share: only level 1, 5% of 10,000 = 500.00, held, cash.
  v_n := public.record_referral_rewards('t-1', v_ref, 'escrow', 10000, 100000, ARRAY[v_ref]);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL fixed: expected exactly 1 reward, got %', v_n; END IF;
  SELECT * INTO v_row FROM public.referral_transactions WHERE payment_id = 't-1';
  IF v_row.referrer_id <> v_l1 OR v_row.referral_level <> 1 OR v_row.referral_earning <> 500.00
     OR v_row.referral_rate <> 5.00 OR v_row.status <> 'pending' OR v_row.payout_type <> 'cash' THEN
    RAISE EXCEPTION 'FAIL fixed: wrong reward (referrer %, level %, earning %, rate %, status %)',
      v_row.referrer_id, v_row.referral_level, v_row.referral_earning, v_row.referral_rate, v_row.status;
  END IF;
  IF v_row.eligible_at < now() + interval '9 days' THEN RAISE EXCEPTION 'FAIL hold: reward is not held for ~10 days'; END IF;
  IF (SELECT count(*) FROM public.referral_transactions WHERE referrer_id IN (v_l2, v_l3)) <> 0 THEN
    RAISE EXCEPTION 'FAIL levels: level 2 or 3 earned something';
  END IF;

  -- Same payment again: no duplicate.
  PERFORM public.record_referral_rewards('t-1', v_ref, 'escrow', 10000, 100000, ARRAY[v_ref]);
  IF (SELECT count(*) FROM public.referral_transactions WHERE payment_id = 't-1') <> 1 THEN
    RAISE EXCEPTION 'FAIL duplicate: same payment paid twice';
  END IF;

  -- Referrer inside the deal earns nothing.
  v_n := public.record_referral_rewards('t-2', v_ref, 'escrow', 10000, 100000, ARRAY[v_ref, v_l1]);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL party: referrer in the deal must not earn'; END IF;

  -- Small commission: below the minimum cash reward, so nothing, and no unlock credit either.
  v_n := public.record_referral_rewards('t-3', v_ref, 'escrow', 3000, 30000, ARRAY[v_ref]);
  IF v_n <> 0 OR (SELECT count(*) FROM public.unlock_credit_ledger WHERE profile_id IN (v_l1, v_ref)) <> 0 THEN
    RAISE EXCEPTION 'FAIL small deal: expected no reward and no credit';
  END IF;

  -- Activation bonus: no credits when an invitee is verified (only the bonus trigger is enabled here).
  INSERT INTO auth.users (id) VALUES (v_new);
  INSERT INTO public.profiles (id) VALUES (v_new) ON CONFLICT (id) DO NOTHING;
  ALTER TABLE public.profiles DISABLE TRIGGER USER;
  UPDATE public.profiles SET invited_by = v_l1 WHERE id = v_new;
  ALTER TABLE public.profiles ENABLE TRIGGER trg_referral_activation_bonus;
  UPDATE public.profiles SET identity_verification_status = 'approved' WHERE id = v_new;
  ALTER TABLE public.profiles ENABLE TRIGGER USER;
  SELECT count(*) INTO v_credits FROM public.unlock_credit_ledger WHERE profile_id IN (v_new, v_l1);
  IF v_credits <> 0 THEN RAISE EXCEPTION 'FAIL activation: expected no bonus credits, got %', v_credits; END IF;

  RAISE EXCEPTION 'REFERRAL_FIXED_RATE_TESTS_PASSED (rolled back on purpose)';
END
$test$;
