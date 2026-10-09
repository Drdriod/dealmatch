-- Security regression suite for 20261009000000_security_audit_hardening.sql.
-- Run against a LOCAL or STAGING database only, never production.
-- Everything runs inside BEGIN ... ROLLBACK, so no data is kept, but the
-- fixtures insert into auth.users. Usage: psql "$DATABASE_URL" -f supabase/tests/security_hardening.sql
-- Expected output: every line starts with PASS (or the diagnostic line). Any FAIL is a regression.
-- Security regression tests for 20261009000000_security_audit_hardening.sql.
-- Runs against the dm_audit scratch database (stubs in place).
-- Each check prints PASS or FAIL. Test data is created and left in place;
-- the whole script runs in a transaction and is rolled back at the end.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_blocked(label text, q text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE q;
    RAISE NOTICE 'FAIL (was allowed, must be blocked): %', label;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS (blocked: %): %', SQLSTATE, label;
  END;
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.expect_ok(label text, q text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE q;
    RAISE NOTICE 'PASS (allowed): %', label;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL (blocked but must be allowed: %): %', label, SQLERRM;
  END;
END $f$;

-- ── 0. Views run as the caller (checked on the migrated state, before test grants) ──
DO $c$ BEGIN
  IF (SELECT coalesce(reloptions, '{}') @> '{security_invoker=true}' FROM pg_class WHERE oid = 'public.v_agent_scorecard'::regclass) THEN
    RAISE NOTICE 'PASS: v_agent_scorecard runs with security_invoker';
  ELSE RAISE NOTICE 'FAIL: v_agent_scorecard runs with owner privileges'; END IF;
  IF has_table_privilege('anon', 'public.v_agent_scorecard', 'SELECT') THEN
    RAISE NOTICE 'FAIL: anon can read v_agent_scorecard';
  ELSE RAISE NOTICE 'PASS: anon cannot read v_agent_scorecard'; END IF;
END $c$;

-- Supabase default privileges: anon/authenticated get table access and RLS does the filtering.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ── fixtures (as postgres, bypasses RLS) ──────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'attacker@example.com'),
  ('00000000-0000-0000-0000-00000000a002', 'tenant@example.com'),
  ('00000000-0000-0000-0000-00000000a003', 'seller@example.com'),
  ('00000000-0000-0000-0000-00000000a004', 'staff@example.com'),
  ('00000000-0000-0000-0000-00000000a005', 'student@example.com'),
  ('00000000-0000-0000-0000-00000000a006', 'provider@example.com'),
  ('00000000-0000-0000-0000-00000000a007', 'founder@example.com'),
  ('00000000-0000-0000-0000-00000000a008', 'student2@example.com');

INSERT INTO public.profiles (id) VALUES
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002'),
  ('00000000-0000-0000-0000-00000000a003'),
  ('00000000-0000-0000-0000-00000000a004'),
  ('00000000-0000-0000-0000-00000000a005'),
  ('00000000-0000-0000-0000-00000000a006'),
  ('00000000-0000-0000-0000-00000000a007'),
  ('00000000-0000-0000-0000-00000000a008')
ON CONFLICT DO NOTHING;

-- Role changes go through the same privileged path as the migration (lock trigger disabled).
ALTER TABLE public.profiles DISABLE TRIGGER trg_lock_sensitive_profile_columns;
ALTER TABLE public.profiles DISABLE TRIGGER trg_forbid_privileged_role_via_rls;
UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-00000000a004';
UPDATE public.profiles SET role = 'buyer' WHERE id IN ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000a005','00000000-0000-0000-0000-00000000a006');
UPDATE public.profiles SET role = 'superadmin' WHERE id = '00000000-0000-0000-0000-00000000a007';
ALTER TABLE public.profiles ENABLE TRIGGER trg_lock_sensitive_profile_columns;
ALTER TABLE public.profiles ENABLE TRIGGER trg_forbid_privileged_role_via_rls;

INSERT INTO public.properties (id, seller_id, title, price, state, city, status, verified_at)
VALUES ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000a003', 'Test flat', 100, 'Lagos', 'Lekki', 'pending', NULL),
       ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000a003', 'Old flat', 100, 'Lagos', 'Lekki', 'removed', NULL);

INSERT INTO public.escrow_transactions (id, property_id, tenant_id, buyer_id, seller_id, status, transaction_type, gross_amount)
VALUES ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a003', 'funded', 'rental', 100000);

INSERT INTO public.student_verifications (id, user_id, status, matric_number)
VALUES ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a005', 'pending', 'M1');

INSERT INTO public.disputes (id, reporter_id, against_id, reason, status)
VALUES ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a003', 'x', 'open');

-- ── 1. Email spoofing must not grant admin ────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', false);
SELECT pg_temp.expect_ok('attacker sets own profile email to founder address',
  $q$UPDATE public.profiles SET email = 'divineandbassey@gmail.com' WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
DO $c$ BEGIN
  IF public.is_admin() OR public.is_staff() OR public.is_admin_staff() OR public.is_superadmin() THEN
    RAISE NOTICE 'FAIL: email spoof granted staff/admin';
  ELSE RAISE NOTICE 'PASS: email spoof grants nothing (is_admin/is_staff/is_admin_staff/is_superadmin all false)';
  END IF;
END $c$;
RESET ROLE;

-- ── 2. Founder and staff roles still work ─────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a007","role":"authenticated"}', false);
DO $c$ BEGIN
  RAISE NOTICE 'diag: is_admin=% is_staff=% is_admin_staff=% is_superadmin=% role=%', public.is_admin(), public.is_staff(), public.is_admin_staff(), public.is_superadmin(), public.get_my_role();
  IF public.is_admin() AND public.is_staff() AND public.is_admin_staff() AND public.is_superadmin() THEN
    RAISE NOTICE 'PASS: superadmin role has full staff access';
  ELSE RAISE NOTICE 'FAIL: superadmin role lost access';
  END IF;
END $c$;
RESET ROLE;

-- ── 3. Internal and server-only RPCs are not callable by clients ──────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', false);
SELECT pg_temp.expect_blocked('client calls release_held_payment', 'SELECT public.release_held_payment(1)');
SELECT pg_temp.expect_blocked('client calls set_verification_level', $q$SELECT public.set_verification_level('00000000-0000-0000-0000-00000000a001', 3::smallint, '{}'::jsonb)$q$);
SELECT pg_temp.expect_blocked('client calls wa_add_strike', $q$SELECT public.wa_add_strike('x', 'x', 3)$q$);
SELECT pg_temp.expect_blocked('client calls account_deletion_blockers', $q$SELECT public.account_deletion_blockers('00000000-0000-0000-0000-00000000a002')$q$);
SELECT pg_temp.expect_blocked('client calls activate_scheduled_commissions', 'SELECT public.activate_scheduled_commissions()');
SELECT pg_temp.expect_blocked('client calls confirm_referral_earning', $q$SELECT public.confirm_referral_earning('00000000-0000-0000-0000-00000000a001','p','t',1,1)$q$);
SELECT pg_temp.expect_blocked('client reads another user wallet balance', $q$SELECT public.available_wallet_balance('00000000-0000-0000-0000-00000000a002')$q$);
SELECT pg_temp.expect_blocked('client reads another user unlock credits', $q$SELECT public.get_unlock_credit_balance('00000000-0000-0000-0000-00000000a002')$q$);
SELECT pg_temp.expect_blocked('client checks another user payout account', $q$SELECT public.has_verified_payout_account('00000000-0000-0000-0000-00000000a002')$q$);
SELECT pg_temp.expect_blocked('client resolves a report as staff', $q$SELECT public.resolve_report(1, 'resolved', 'x', '00000000-0000-0000-0000-00000000a001')$q$);
SELECT pg_temp.expect_blocked('client reads own wallet balance (not a client RPC; wallet uses ledger reads)', $q$SELECT public.available_wallet_balance('00000000-0000-0000-0000-00000000a001')$q$);
RESET ROLE;

-- ── 4. Anonymous visitors ─────────────────────────────────────────────────
SET ROLE anon;
SELECT pg_temp.expect_blocked('anon checks email existence', $q$SELECT public.check_email_exists('a@b.com')$q$);
SELECT pg_temp.expect_blocked('anon calls wa_add_strike', $q$SELECT public.wa_add_strike('x', 'x', 3)$q$);
SELECT pg_temp.expect_blocked('anon calls erase_account_data', $q$SELECT public.erase_account_data('00000000-0000-0000-0000-00000000a001')$q$);
SELECT pg_temp.expect_ok('anon signup username check still works', $q$SELECT public.check_username_exists('someone')$q$);
SELECT pg_temp.expect_ok('anon signup phone check still works', $q$SELECT public.check_phone_exists('+2340000000')$q$);
SELECT pg_temp.expect_ok('anon admin login lockout check still works', $q$SELECT public.is_admin_login_locked('x@y.com')$q$);
RESET ROLE;

-- ── 5. Column guards: escrow ──────────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}', false);
SELECT pg_temp.expect_blocked('tenant forces escrow status to released',
  $q$UPDATE public.escrow_transactions SET status = 'released' WHERE id = '90000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.expect_blocked('tenant changes escrow amount',
  $q$UPDATE public.escrow_transactions SET gross_amount = 1 WHERE id = '90000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.expect_ok('tenant confirms move-in',
  $q$UPDATE public.escrow_transactions SET confirmed_at = now() WHERE id = '90000000-0000-0000-0000-000000000001'$q$);
RESET ROLE;

-- ── 6. Column guards: properties ──────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}', false);
SELECT pg_temp.expect_blocked('seller self-verifies listing (status active, no approval)',
  $q$UPDATE public.properties SET status = 'active', verified_at = now() WHERE id = '10000000-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.expect_blocked('seller re-lists a never-approved listing',
  $q$UPDATE public.properties SET status = 'active' WHERE id = '10000000-0000-0000-0000-00000000000b'$q$);
SELECT pg_temp.expect_blocked('seller sets verified_by',
  $q$UPDATE public.properties SET verified_by = seller_id WHERE id = '10000000-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.expect_blocked('seller reassigns seller_id',
  $q$UPDATE public.properties SET seller_id = '00000000-0000-0000-0000-00000000a001' WHERE id = '10000000-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.expect_blocked('seller inserts an already-active listing',
  $q$INSERT INTO public.properties (seller_id, title, price, state, city, status) VALUES ('00000000-0000-0000-0000-00000000a003','x',1,'Lagos','Lekki','active')$q$);
SELECT pg_temp.expect_ok('seller pauses own listing (removed)',
  $q$UPDATE public.properties SET status = 'removed' WHERE id = '10000000-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.expect_ok('seller inserts pending listing',
  $q$INSERT INTO public.properties (seller_id, title, price, state, city, status) VALUES ('00000000-0000-0000-0000-00000000a003','y',1,'Lagos','Lekki','pending')$q$);
RESET ROLE;

-- ── 7. Column guards: student verification ────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a005","role":"authenticated"}', false);
SELECT pg_temp.expect_blocked('student sets own status to approved',
  $q$UPDATE public.student_verifications SET status = 'approved' WHERE id = '80000000-0000-0000-0000-000000000001'$q$);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a008","role":"authenticated"}', false);
SELECT pg_temp.expect_blocked('student inserts an approved record',
  $q$INSERT INTO public.student_verifications (user_id, status) VALUES ('00000000-0000-0000-0000-00000000a008','approved')$q$);
SELECT pg_temp.expect_ok('student inserts a pending record',
  $q$INSERT INTO public.student_verifications (user_id, status) VALUES ('00000000-0000-0000-0000-00000000a008','pending')$q$);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a005","role":"authenticated"}', false);
SELECT pg_temp.expect_ok('student updates matric number while pending',
  $q$UPDATE public.student_verifications SET matric_number = 'M2' WHERE id = '80000000-0000-0000-0000-000000000001'$q$);
RESET ROLE;

-- ── 8. Column guards: disputes ────────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}', false);
SELECT pg_temp.expect_blocked('reporter resolves own dispute',
  $q$UPDATE public.disputes SET status = 'resolved' WHERE id = '70000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.expect_ok('reporter opens a dispute',
  $q$INSERT INTO public.disputes (reporter_id, against_id, reason, status) VALUES ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000a003','y','open')$q$);
RESET ROLE;

-- ── 9. Staff actions still work, resolver is the caller ───────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}', false);
SELECT pg_temp.expect_ok('staff update of a listing to active', $q$UPDATE public.properties SET status = 'active', verified_at = now(), verified_by = '00000000-0000-0000-0000-00000000a004' WHERE id = '10000000-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.expect_ok('staff escrow status update', $q$UPDATE public.escrow_transactions SET status = 'released' WHERE id = '90000000-0000-0000-0000-000000000001'$q$);
RESET ROLE;

-- ── 10. Policy check: no founder email left in RLS ────────────────────────
DO $c$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname IN ('public','storage') AND (coalesce(qual,'') ~ 'gmail' OR coalesce(with_check,'') ~ 'gmail')) THEN
    RAISE NOTICE 'FAIL: founder email still in a policy';
  ELSE RAISE NOTICE 'PASS: no founder email in any RLS policy'; END IF;
END $c$;

-- ── 11. End-state checks (as owner): allowed writes really changed rows ──
DO $c$
DECLARE v record;
BEGIN
  SELECT status, verified_at INTO v FROM public.properties WHERE id = '10000000-0000-0000-0000-00000000000a';
  IF v.status = 'active' THEN RAISE NOTICE 'PASS: staff activation persisted'; ELSE RAISE NOTICE 'FAIL: staff activation did not persist (status=%)', v.status; END IF;
  SELECT confirmed_at INTO v FROM public.escrow_transactions WHERE id = '90000000-0000-0000-0000-000000000001';
  -- confirmed_at was set by the tenant, then the escrow was released by staff in section 9; both prove the row changed.
  IF v.confirmed_at IS NOT NULL THEN RAISE NOTICE 'PASS: tenant move-in confirmation persisted'; ELSE RAISE NOTICE 'FAIL: tenant move-in confirmation did not persist'; END IF;
  SELECT matric_number INTO v FROM public.student_verifications WHERE id = '80000000-0000-0000-0000-000000000001';
  IF v.matric_number = 'M2' THEN RAISE NOTICE 'PASS: student pending-record edit persisted'; ELSE RAISE NOTICE 'FAIL: student edit did not persist'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000a001' AND role <> 'buyer') THEN
    RAISE NOTICE 'FAIL: attacker role changed'; ELSE RAISE NOTICE 'PASS: attacker role unchanged'; END IF;
END $c$;

ROLLBACK;
