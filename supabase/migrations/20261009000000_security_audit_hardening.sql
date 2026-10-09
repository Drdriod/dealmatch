-- ============================================================================
-- Security audit hardening (October 2026 database audit)
--
-- Findings this migration closes:
--
--  1. EMAIL-BASED ADMIN AUTHORITY. is_admin() trusted profiles.email, a column
--     the user can write on their own row (the profile lock trigger does not
--     cover email). Setting your profile email to a founder address made
--     is_admin() true. is_staff()/is_admin_staff() and ~34 RLS policies (plus
--     storage policies) also whitelisted founder emails via auth.email().
--     Fix: authority comes only from profiles.role. The two founder accounts
--     are moved to role 'superadmin' (matched on auth.users, the verified
--     identity), and every email whitelist in RLS/functions is replaced by
--     public.is_superadmin().
--
--  2. INTERNAL / SERVER-ONLY FUNCTIONS EXECUTABLE BY ANYONE. Most SECURITY
--     DEFINER functions were granted to PUBLIC (so anon and authenticated).
--     Examples: release_held_payment (queues a payout on any transaction),
--     set_verification_level (sets anyone's verification level),
--     wa_add_strike (suspends any WhatsApp contact), account_deletion_blockers
--     and erase_account_data (service-only), activate_scheduled_commissions,
--     confirm_referral_earning, the fn_* trigger functions, and others.
--     Fix: EXECUTE is revoked from PUBLIC/anon/authenticated for everything
--     that is not an RPC the client calls and not a policy helper. Trigger
--     and internal calls are unaffected (they run as the function owner).
--
--  3. CALLABLE WITH NO CALLER CHECK (data read or change for other users):
--     available_wallet_balance, has_verified_payout_account,
--     get_unlock_credit_balance, resolve_report (caller-supplied
--     resolved_by), set_verification_level, release_held_payment. Each now
--     checks that the caller owns the data or is staff, or is internal.
--
--  4. CHECK_EMAIL_EXISTS ENUMERATION. Not called by the app; revoked from
--     anon. (check_phone_exists / check_username_exists / check_device_exists /
--     check_signup_conflicts stay anon-callable because signup needs them.)
--
--  5. ROW-LEVEL UPDATE POLICIES WITHOUT COLUMN LIMITS. A tenant could update
--     any column on their funded escrow row; a seller could set verification
--     fields and re-activate rejected listings; a student could set their own
--     verification status; a dispute reporter could set its status. Column
--     guard triggers now restrict direct client writes to the columns the
--     app actually uses. Triggers only apply to direct client writes
--     (current_user = authenticated/anon). Definer functions and staff
--     writes are unaffected.
--
--  6. SEARCH PATH. Every SECURITY DEFINER function in public without an
--     explicit search_path gets one, so object resolution cannot be redirected
--     by a caller-created schema object.
--
-- Not changed here (documented in the audit report): signup-time anon checks
-- need rate limiting at the edge; the admin login lockout RPC is anon-callable
-- by design; the identity-docs bucket is readable by the 'agent' role.
-- ============================================================================


-- ── 1. Founder identity: role instead of email ─────────────────────────────

-- New single source of truth for the founder/superadmin check.
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'
  )
$$;

-- Move the two founder accounts onto role 'superadmin'. Matched on
-- auth.users (the verified login identity), never on profiles.email. The
-- lock/forbid triggers would revert this write (no auth context in a
-- migration), so they are disabled for this statement only.
ALTER TABLE public.profiles DISABLE TRIGGER trg_lock_sensitive_profile_columns;
ALTER TABLE public.profiles DISABLE TRIGGER trg_forbid_privileged_role_via_rls;

UPDATE public.profiles p
   SET role = 'superadmin'
  FROM auth.users u
 WHERE u.id = p.id
   AND lower(u.email) IN ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com')
   AND p.role IS DISTINCT FROM 'superadmin';

ALTER TABLE public.profiles ENABLE TRIGGER trg_lock_sensitive_profile_columns;
ALTER TABLE public.profiles ENABLE TRIGGER trg_forbid_privileged_role_via_rls;

-- Role-only helpers. Same signatures and return types as before.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'agent')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'agent', 'verifier')
  )
$$;

-- Profile lock trigger: same protection as before, minus the email whitelist.
CREATE OR REPLACE FUNCTION public.fn_lock_sensitive_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_is_privileged boolean;
  v_blocked boolean := false;
BEGIN
  v_is_privileged := (
    public.fn_is_trusted_role_grant_context()
    OR public.get_my_role() IN ('admin', 'superadmin', 'verifier')
    OR public.is_admin_staff()
  );

  IF v_is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN NEW.role := OLD.role; v_blocked := true; END IF;
  IF NEW.is_photo_verified IS DISTINCT FROM OLD.is_photo_verified THEN NEW.is_photo_verified := OLD.is_photo_verified; v_blocked := true; END IF;
  IF NEW.is_live_verified IS DISTINCT FROM OLD.is_live_verified THEN NEW.is_live_verified := OLD.is_live_verified; v_blocked := true; END IF;
  IF NEW.live_verified_at IS DISTINCT FROM OLD.live_verified_at THEN NEW.live_verified_at := OLD.live_verified_at; v_blocked := true; END IF;
  IF NEW.id_verified IS DISTINCT FROM OLD.id_verified THEN NEW.id_verified := OLD.id_verified; v_blocked := true; END IF;
  IF NEW.id_verified_at IS DISTINCT FROM OLD.id_verified_at THEN NEW.id_verified_at := OLD.id_verified_at; v_blocked := true; END IF;

  -- Self-submission is the one allowed status move. 'approved' and
  -- 'rejected' can only be set by staff.
  IF NEW.identity_verification_status IS DISTINCT FROM OLD.identity_verification_status
     AND NEW.identity_verification_status IS DISTINCT FROM 'submitted' THEN
    NEW.identity_verification_status := OLD.identity_verification_status;
    v_blocked := true;
  END IF;

  IF NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at THEN NEW.identity_verified_at := OLD.identity_verified_at; v_blocked := true; END IF;
  IF NEW.identity_verified_by IS DISTINCT FROM OLD.identity_verified_by THEN NEW.identity_verified_by := OLD.identity_verified_by; v_blocked := true; END IF;
  IF NEW.identity_rejection_note IS DISTINCT FROM OLD.identity_rejection_note THEN NEW.identity_rejection_note := OLD.identity_rejection_note; v_blocked := true; END IF;
  IF NEW.referral_earnings IS DISTINCT FROM OLD.referral_earnings THEN NEW.referral_earnings := OLD.referral_earnings; v_blocked := true; END IF;
  IF NEW.referral_paid_out IS DISTINCT FROM OLD.referral_paid_out THEN NEW.referral_paid_out := OLD.referral_paid_out; v_blocked := true; END IF;
  IF NEW.referral_level IS DISTINCT FROM OLD.referral_level THEN NEW.referral_level := OLD.referral_level; v_blocked := true; END IF;
  IF NEW.is_student_verified IS DISTINCT FROM OLD.is_student_verified THEN NEW.is_student_verified := OLD.is_student_verified; v_blocked := true; END IF;
  IF NEW.account_flagged IS DISTINCT FROM OLD.account_flagged THEN NEW.account_flagged := OLD.account_flagged; v_blocked := true; END IF;
  IF NEW.flagged_reason IS DISTINCT FROM OLD.flagged_reason THEN NEW.flagged_reason := OLD.flagged_reason; v_blocked := true; END IF;
  IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN NEW.account_status := OLD.account_status; v_blocked := true; END IF;
  IF NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN NEW.invited_by := OLD.invited_by; v_blocked := true; END IF;

  IF v_blocked THEN
    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES ('blocked_self_profile_privilege_edit', jsonb_build_object('profile_id', OLD.id), auth.uid());
  END IF;

  RETURN NEW;
END;
$function$;

-- Platform revenue (fn_calculate_revenue_split) was credited to the first
-- profile whose profiles.email matched a founder address. profiles.email is
-- user-writable, so a user could set it and receive the platform's share.
-- The platform recipient is now the superadmin role, which users cannot set.
DO $do$
DECLARE
  def text;
BEGIN
  def := pg_get_functiondef('public.fn_calculate_revenue_split(uuid)'::regprocedure);
  def := replace(def,
    $q$WHERE email IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')$q$,
    $q$WHERE role = 'superadmin' ORDER BY id$q$);
  IF def ~ 'gmail' THEN
    RAISE EXCEPTION 'could not rewrite the platform recipient lookup in fn_calculate_revenue_split';
  END IF;
  EXECUTE def;
END
$do$;

-- Staff-invite revocation: superadmin only, by role.
CREATE OR REPLACE FUNCTION public.revoke_staff_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'only the superadmin may revoke a staff invite' USING ERRCODE = '42501';
  END IF;
  UPDATE public.staff_invites SET status = 'revoked' WHERE id = p_invite_id AND status = 'pending';
END;
$function$;

-- Replace every founder-email check in RLS policies (public and storage)
-- with public.is_superadmin(). Three expression forms exist in the schema.
DO $do$
DECLARE
  r        record;
  f        text;
  q        text;
  wc       text;
  sql      text;
  founders text := '''divineandbassey@gmail.com''::text, ''prosperwithbassey@gmail.com''::text';
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname IN ('public', 'storage')
       AND (coalesce(qual, '') ~ 'gmail' OR coalesce(with_check, '') ~ 'gmail')
  LOOP
    -- Same replacement for USING and WITH CHECK.
    f := r.qual;
    IF f IS NOT NULL THEN
      f := replace(f, 'auth.email() = ANY (ARRAY[' || founders || '])', 'public.is_superadmin()');
      f := replace(f, '(auth.jwt() ->> ''email''::text) = ANY (ARRAY[' || founders || '])', 'public.is_superadmin()');
      f := replace(f, '(auth.jwt() ->> ''email''::text) = ''divineandbassey@gmail.com''::text', 'public.is_superadmin()');
      f := replace(f, '(auth.jwt() ->> ''email''::text) = ''prosperwithbassey@gmail.com''::text', 'public.is_superadmin()');
    END IF;
    q := f;

    f := r.with_check;
    IF f IS NOT NULL THEN
      f := replace(f, 'auth.email() = ANY (ARRAY[' || founders || '])', 'public.is_superadmin()');
      f := replace(f, '(auth.jwt() ->> ''email''::text) = ANY (ARRAY[' || founders || '])', 'public.is_superadmin()');
      f := replace(f, '(auth.jwt() ->> ''email''::text) = ''divineandbassey@gmail.com''::text', 'public.is_superadmin()');
      f := replace(f, '(auth.jwt() ->> ''email''::text) = ''prosperwithbassey@gmail.com''::text', 'public.is_superadmin()');
    END IF;
    wc := f;

    sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL AND r.qual ~ 'gmail' THEN
      sql := sql || ' USING (' || q || ')';
    END IF;
    IF r.with_check IS NOT NULL AND r.with_check ~ 'gmail' THEN
      sql := sql || ' WITH CHECK (' || wc || ')';
    END IF;
    EXECUTE sql;
  END LOOP;

  -- Fail loudly if any founder-email check survived (in a policy or function).
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname IN ('public', 'storage')
       AND (coalesce(qual, '') ~ 'gmail' OR coalesce(with_check, '') ~ 'gmail')
  ) THEN
    RAISE EXCEPTION 'founder email check still present in an RLS policy';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosrc ~ 'gmail'
  ) THEN
    RAISE EXCEPTION 'founder email check still present in a public function';
  END IF;
END
$do$;


-- ── 1c. Listing sanitizer: every property insert/update was failing ─────────
-- fn_sanitize_text (baseline schema) calls regexp_replace(input, chr(0), ...).
-- PostgreSQL text cannot contain NUL, and chr(0) raises "null character not
-- permitted", so every write to public.properties through trg_sanitize_property
-- errored. The NUL step is removed. The other steps are unchanged.
CREATE OR REPLACE FUNCTION public.fn_sanitize_text(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT
AS $function$
BEGIN
  -- Remove script tags and SQL comment sequences. Text cannot contain NUL
  -- bytes in PostgreSQL, so no NUL step is needed.
  input := regexp_replace(input, '<[^>]+>', '', 'g');
  input := regexp_replace(input, '--', '', 'g');
  input := regexp_replace(input, '(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC)\s', '', 'gi');
  RETURN trim(input);
END;
$function$;


-- ── 2. Guards on sensitive RPC bodies ───────────────────────────────────────
-- current_user is the function owner inside SECURITY DEFINER code and the
-- caller's role (authenticated / anon) when a client invokes the RPC directly.
-- Internal-only functions therefore refuse direct client calls.

CREATE OR REPLACE FUNCTION public.release_held_payment(p_transaction_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_tx     public.transactions%ROWTYPE;
  v_amount BIGINT;
BEGIN
  -- Internal only: called from confirm_transaction_buyer / _provider once
  -- both sides have confirmed. EXECUTE is revoked from anon/authenticated
  -- (section 4), so a client cannot queue a payout directly.

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND OR v_tx.provider_id IS NULL THEN
    RETURN;
  END IF;

  v_amount := COALESCE(v_tx.amount_cents, 0) - COALESCE(v_tx.commission_amount_cents, 0);
  IF v_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.commission_wallet_ledger (profile_id, transaction_id, entry_type, amount_cents)
  VALUES (v_tx.provider_id, v_tx.id, 'held', v_amount);

  INSERT INTO public.payout_queue (transaction_id, profile_id, payout_account_id, amount_cents)
  VALUES (v_tx.id, v_tx.provider_id, v_tx.provider_payout_account_id, v_amount)
  ON CONFLICT (transaction_id) DO NOTHING;

  UPDATE public.transactions SET payout_status = 'queued' WHERE id = v_tx.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_verification_level(p_user_id uuid, p_level smallint, p_level_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  -- Internal only: review_verification_submission, demote_verification_level
  -- and the auto-approve trigger call this. EXECUTE is revoked from
  -- anon/authenticated (section 4).

  IF p_level NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'level must be between 0 and 3, got %', p_level;
  END IF;

  INSERT INTO public.verified_providers (user_id, level, level_data, updated_at)
  VALUES (p_user_id, p_level, COALESCE(p_level_data, '{}'::jsonb), now())
  ON CONFLICT (user_id) DO UPDATE
    SET level = EXCLUDED.level,
        level_data = EXCLUDED.level_data,
        updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_report(p_report_id bigint, p_status text, p_resolution_notes text, p_resolved_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'only staff can resolve reports' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('investigating', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'invalid resolution status: %', p_status;
  END IF;

  -- The resolver is always the caller, never a caller-supplied id.
  UPDATE public.reports
  SET status = p_status,
      resolution_notes = p_resolution_notes,
      resolved_at = CASE WHEN p_status IN ('resolved','dismissed') THEN now() ELSE resolved_at END,
      resolved_by = auth.uid()
  WHERE id = p_report_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.available_wallet_balance(p_profile_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  IF p_profile_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN
    COALESCE((SELECT SUM(amount_cents) FROM public.commission_wallet_ledger
              WHERE profile_id = p_profile_id AND entry_type = 'released'), 0)
    - COALESCE((SELECT SUM(amount_cents) FROM public.commission_wallet_ledger
                WHERE profile_id = p_profile_id AND entry_type = 'withdrawn'), 0)
    - COALESCE((SELECT SUM(amount_cents) FROM public.withdrawal_requests
                WHERE profile_id = p_profile_id AND status = 'pending'), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_verified_payout_account(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  IF p_profile_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.payout_accounts
    WHERE profile_id = p_profile_id AND status = 'verified'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_unlock_credit_balance(p_profile_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_target uuid := COALESCE(p_profile_id, auth.uid());
BEGIN
  IF v_target IS DISTINCT FROM auth.uid() AND NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(SUM(CASE WHEN entry_type = 'spent' THEN -credits ELSE credits END), 0)::INTEGER
    FROM public.unlock_credit_ledger
    WHERE profile_id = v_target
  );
END;
$function$;

-- account_deletion_blockers / erase_account_data are called only by the API
-- with the service role. The generic grant pass in section 4 removes them from
-- PUBLIC, anon and authenticated, so no body change is needed here.


-- ── 3. Column guards for direct client writes ──────────────────────────────
-- Only direct PostgREST writes (current_user = authenticated/anon) by
-- non-staff are restricted. Staff, definer functions and the service role
-- are unaffected. These trigger functions are SECURITY INVOKER on purpose:
-- inside a SECURITY DEFINER function current_user would be the owner, and the
-- check would never fire.

-- 3a. Escrow: a tenant may only confirm move-in (confirmed_at). The release
--     itself happens in trg_release_on_confirm, which runs as the owner.
CREATE OR REPLACE FUNCTION public.fn_guard_escrow_client_update()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user is the calling client role.
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin_staff() THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'confirmed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'confirmed_at') THEN
    RAISE EXCEPTION 'only move-in confirmation can be changed directly' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_escrow_client_update ON public.escrow_transactions;
CREATE TRIGGER trg_guard_escrow_client_update
  BEFORE UPDATE ON public.escrow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_escrow_client_update();

-- The move-in release trigger sets status = 'released' on the tenant's own
-- update. The existing tenant policy only allowed 'funded' in WITH CHECK, so
-- the confirm failed. This permissive policy adds the same USING and allows
-- the released state in WITH CHECK. Column guard 3a still limits what the
-- tenant can change.
DROP POLICY IF EXISTS "Tenant confirms move-in" ON public.escrow_transactions;
CREATE POLICY "Tenant confirms move-in" ON public.escrow_transactions
  FOR UPDATE TO authenticated
  USING (tenant_id = auth.uid() AND status = 'funded')
  WITH CHECK (tenant_id = auth.uid() AND status IN ('funded', 'released'));

-- 3b. Properties: owners cannot verify, assign or self-approve a listing.
--     Owners may pause/remove, and re-list only a listing staff had approved.
CREATE OR REPLACE FUNCTION public.fn_guard_property_client_write()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user is the calling client role.
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin_staff() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'pending_review')
       OR NEW.verified_by IS NOT NULL OR NEW.verified_at IS NOT NULL
       OR NEW.verification_date IS NOT NULL OR NEW.assigned_agent_id IS NOT NULL THEN
      RAISE EXCEPTION 'new listings start as pending review' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verification_date IS DISTINCT FROM OLD.verification_date
     OR NEW.verification_note IS DISTINCT FROM OLD.verification_note
     OR NEW.verification_notes IS DISTINCT FROM OLD.verification_notes
     OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.payment_ref IS DISTINCT FROM OLD.payment_ref
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.review_count IS DISTINCT FROM OLD.review_count
     OR NEW.view_count IS DISTINCT FROM OLD.view_count
     OR NEW.like_count IS DISTINCT FROM OLD.like_count THEN
    RAISE EXCEPTION 'this listing field is managed by DealMatch staff' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'removed' THEN
      NULL;
    ELSIF NEW.status = 'active' AND OLD.status = 'removed' AND OLD.verified_at IS NOT NULL THEN
      NULL; -- re-list a listing staff had approved
    ELSE
      RAISE EXCEPTION 'listing status can only be paused/removed, or re-listed after approval' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_property_client_write ON public.properties;
CREATE TRIGGER trg_guard_property_client_write
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_property_client_write();

-- 3c. Student verification: users submit as 'pending' and cannot approve
--     themselves or change the reviewer fields. Staff decide the outcome.
CREATE OR REPLACE FUNCTION public.fn_guard_student_verification_client_write()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user is the calling client role.
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin_staff() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending'
       OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL THEN
      RAISE EXCEPTION 'a student verification starts as pending' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'this verification field is managed by DealMatch staff' USING ERRCODE = '42501';
  END IF;

  -- Users may resubmit after a rejection, but never change an approved record.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status <> 'pending' OR OLD.status NOT IN ('rejected', 'pending')) THEN
    RAISE EXCEPTION 'only staff can change a verification decision' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_student_verification_client_write ON public.student_verifications;
CREATE TRIGGER trg_guard_student_verification_client_write
  BEFORE INSERT OR UPDATE ON public.student_verifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_student_verification_client_write();

-- 3d. Disputes: a reporter may open one, but not change its status, resolution
--     or parties afterwards.
CREATE OR REPLACE FUNCTION public.fn_guard_dispute_client_write()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user is the calling client role.
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin_staff() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'open' OR NEW.resolution IS NOT NULL THEN
      RAISE EXCEPTION 'a dispute starts as open' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.resolution IS DISTINCT FROM OLD.resolution
     OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id
     OR NEW.against_id IS DISTINCT FROM OLD.against_id THEN
    RAISE EXCEPTION 'only staff can change a dispute outcome' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_dispute_client_write ON public.disputes;
CREATE TRIGGER trg_guard_dispute_client_write
  BEFORE INSERT OR UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_dispute_client_write();


-- ── 4. Function EXECUTE grants ──────────────────────────────────────────────
-- Client-called RPCs (grep of src/ and api/): keep for authenticated.
-- Anonymous-callable ones are listed in keep_anon. Everything else that is a
-- SECURITY DEFINER or trigger-only function loses PUBLIC/anon/authenticated.
-- Policy helpers (get_my_role, is_admin, ...) keep EXECUTE because RLS runs
-- as the querying role. service_role keeps its grant.
DO $do$
DECLARE
  r record;
  keep_client text[] := ARRAY[
    'accept_bid','accept_staff_invite','cancel_transaction','check_booking_availability',
    'check_device_exists','check_phone_exists','check_signup_conflicts','check_username_exists',
    'confirm_transaction_buyer','confirm_transaction_provider','counter_bid','demote_verification_level',
    'fulfill_withdrawal_request','get_provider_contact','get_property_contact','get_unlock_credit_balance',
    'get_listing_with_latlng','has_verified_payout_account','increment_thread_view_count',
    'is_admin_login_locked','record_admin_login_attempt','match_category_listings','process_referral_payouts_for_transaction',
    'redeem_loyalty_points','reject_payout_account','reject_withdrawal_request','request_withdrawal',
    'review_verification_submission','revoke_staff_invite','spend_unlock_credit','start_escrow_payment',
    'start_property_escrow_payment','submit_payout_account','submit_verification','universal_match',
    'universal_search','verify_payout_account','start_escrow_payment'
  ];
  keep_anon text[] := ARRAY[
    'check_booking_availability','check_device_exists','check_phone_exists','check_signup_conflicts',
    'check_username_exists','get_listing_with_latlng','increment_thread_view_count','is_admin_login_locked',
    'match_category_listings','record_admin_login_attempt','universal_match','universal_search'
  ];
  is_policy_helper boolean;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    is_policy_helper := EXISTS (
      SELECT 1 FROM pg_policies pp
       WHERE pp.schemaname IN ('public', 'storage')
         AND (coalesce(pp.qual, '') ~ ('\m' || r.proname || '\(')
              OR coalesce(pp.with_check, '') ~ ('\m' || r.proname || '\('))
    );

    IF r.proname = ANY (keep_client) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
      IF r.proname = ANY (keep_anon) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
      ELSE
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
      END IF;
    ELSIF is_policy_helper THEN
      -- RLS runs as anon/authenticated, so they must keep EXECUTE on this helper.
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    END IF;
  END LOOP;
END
$do$;

-- check_email_exists is not called by the app (it enabled account enumeration).
REVOKE EXECUTE ON FUNCTION public.check_email_exists(text) FROM PUBLIC, anon, authenticated;

-- Server-only functions: the API uses the service role, never a client.
REVOKE EXECUTE ON FUNCTION public.wa_add_strike(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erase_account_data(uuid) FROM PUBLIC, anon, authenticated;


-- ── 5. Search path on every SECURITY DEFINER function ───────────────────────
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef AND p.proconfig IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END
$do$;


-- ── 6. Table privileges: anon read-only, except the public enquiry form ─────
-- Supabase's default privileges give anon and authenticated full table
-- rights on public tables. RLS is the only thing stopping misuse. Every
-- anonymous write policy here is already unreachable for anon (it needs
-- auth.uid()/auth.role()), except rental_enquiries, which is an intentional
-- public contact form. So anon loses write rights everywhere except that form.
-- TRUNCATE, REFERENCES and TRIGGER are never needed by a client.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;
GRANT INSERT ON public.rental_enquiries TO anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Future tables: anon gets no write rights by default either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;


-- ── 7. Pinecone index status is operational data: staff only ───────────────
-- It exposes internal error_log text and has no client reads.
DROP POLICY IF EXISTS "Public read pinecone status" ON public.pinecone_index_status;
DROP POLICY IF EXISTS "Staff read pinecone status" ON public.pinecone_index_status;
CREATE POLICY "Staff read pinecone status" ON public.pinecone_index_status
  FOR SELECT TO authenticated
  USING (public.is_admin_staff());


-- ── 8. Views run as the caller, so RLS applies ─────────────────────────────
-- A view without security_invoker runs with its owner's privileges and
-- bypasses the caller's RLS. v_agent_scorecard exposes agent name, email,
-- phone and complaint figures, so it must not run as the owner.
-- admin_deal_pipeline and my_requests are set the same way for consistency
-- (they are already set in 20260813000000 and are re-asserted here).
-- provider_stats is deliberately left owner-run: it returns per-provider
-- aggregates (review count, completion rate) that public provider pages need,
-- and as an invoker view it would only count the viewer's own transactions.
DO $do$
BEGIN
  IF to_regclass('public.v_agent_scorecard') IS NOT NULL THEN
    ALTER VIEW public.v_agent_scorecard SET (security_invoker = true);
    REVOKE ALL ON public.v_agent_scorecard FROM anon;
  END IF;
  IF to_regclass('public.admin_deal_pipeline') IS NOT NULL THEN
    ALTER VIEW public.admin_deal_pipeline SET (security_invoker = true);
    REVOKE ALL ON public.admin_deal_pipeline FROM anon;
  END IF;
  IF to_regclass('public.my_requests') IS NOT NULL THEN
    ALTER VIEW public.my_requests SET (security_invoker = true);
    REVOKE ALL ON public.my_requests FROM anon;
  END IF;
END
$do$;
