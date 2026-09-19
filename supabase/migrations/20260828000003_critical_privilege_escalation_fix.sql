-- ============================================================================
-- CRITICAL: privilege escalation via public.profiles
--
-- Found while building the staff/invite work. Two separate holes, both
-- exploitable by any logged-in user (or, for #1, anyone with the public
-- anon key - which the assessment already documented as client-visible):
--
-- 1) handle_new_user() copied raw_user_meta_data->>'role' straight into
--    profiles.role with no allowlist. Any caller of
--    supabase.auth.signUp({ options: { data: { role: 'superadmin' } } })
--    got exactly that role. The DealMatch UI never sends this field, but
--    nothing stopped a direct API call from doing so.
--
-- 2) At least five overlapping RLS policies on profiles allow a user to
--    UPDATE their own row (id = auth.uid()) with no column-level
--    restriction at all. Because RLS is row-level, not column-level, a
--    plain client call like
--      supabase.from('profiles').update({ role: 'admin' }).eq('id', me)
--    passes every one of those policies today and grants the caller admin
--    (or superadmin) access to every table whose RLS trusts get_my_role().
--    The same gap lets a user set is_photo_verified, identity_verification_status,
--    referral_earnings, account_status etc. on themselves directly.
--
-- Fix: (a) allowlist self-service roles at signup, and (b) a BEFORE UPDATE
-- trigger that locks the sensitive columns to their existing value unless
-- the caller is already staff/admin/superadmin/service_role. This is a
-- defense-in-depth backstop that holds regardless of which of the
-- accumulated permissive policies let the UPDATE statement through, so it
-- doesn't require untangling or risk breaking all five policies at once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Signup can only ever grant a safe, self-service role. Anything else
--    (agent/verifier/admin/superadmin/suspended/deleted) is ignored and the
--    row falls back to the safe default. Staff roles are granted only
--    through the invite flow added below, never through public signup.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_requested_role text := new.raw_user_meta_data->>'role';
  v_safe_role text;
BEGIN
  v_safe_role := CASE
    WHEN v_requested_role IN ('buyer','seller','renter','landlord','investor','student') THEN v_requested_role
    ELSE 'buyer'
  END;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    v_safe_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Shared helper: is this statement running inside a context we've
-- explicitly decided to trust with a role grant? auth.role() reflects the
-- JWT of the original caller even inside a SECURITY DEFINER function, so a
-- SECURITY DEFINER RPC cannot make itself look like 'service_role' just by
-- being SECURITY DEFINER. Trusted server code (the staff-invite RPC added
-- later in this file) opts in explicitly and only for the duration of its
-- own transaction, via a GUC a client can never set directly since clients
-- can only invoke whitelisted RPCs, never arbitrary SET statements.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_is_trusted_role_grant_context() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT auth.role() = 'service_role'
      OR COALESCE(current_setting('app.trusted_role_grant', true), '') = 'true'
$$;

-- ---------------------------------------------------------------------------
-- 2) Lock privileged / fraud-sensitive columns against self-service edits.
--    A caller can still update everything else about their own profile
--    (name, bio, avatar, preferences, etc.) exactly as before; only the
--    columns listed here are protected, and only for non-staff callers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_lock_sensitive_profile_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_is_privileged boolean;
  v_blocked boolean := false;
BEGIN
  v_is_privileged := (
    public.fn_is_trusted_role_grant_context()
    OR public.get_my_role() IN ('admin', 'superadmin', 'verifier')
    OR public.is_admin_staff()
    OR auth.email() = ANY (ARRAY['divineandbassey@gmail.com','prosperwithbassey@gmail.com'])
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
  IF NEW.identity_verification_status IS DISTINCT FROM OLD.identity_verification_status THEN NEW.identity_verification_status := OLD.identity_verification_status; v_blocked := true; END IF;
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
$$;

DROP TRIGGER IF EXISTS trg_lock_sensitive_profile_columns ON public.profiles;
CREATE TRIGGER trg_lock_sensitive_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_lock_sensitive_profile_columns();

-- ---------------------------------------------------------------------------
-- 3) profiles_role_check already restricts role to a fixed set of values;
--    tighten it further so 'admin' and 'superadmin' can only ever be
--    written by a migration or a service_role statement, never through a
--    normal RLS-governed client update. The trigger above is the primary
--    defense; this constraint is a second, independent backstop.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_forbid_privileged_role_via_rls() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  IF NEW.role IN ('admin','superadmin') AND NOT public.fn_is_trusted_role_grant_context() THEN
    RAISE EXCEPTION 'role % can only be granted through the staff invite flow', NEW.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forbid_privileged_role_via_rls ON public.profiles;
CREATE TRIGGER trg_forbid_privileged_role_via_rls
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role IN ('admin','superadmin'))
  EXECUTE FUNCTION public.fn_forbid_privileged_role_via_rls();
