-- ============================================================================
-- Urgent regression fix: 20260828000003's privilege-escalation trigger
-- correctly stops a user from setting their OWN identity_verification_status
-- to 'approved' (self-approval), but it went too far and blocked the
-- legitimate case too - a user setting their own status to 'submitted' when
-- they actually submit their ID and selfie. Since that trigger fires on
-- every profiles UPDATE and silently reverts locked columns rather than
-- raising an error, the submission flow looked like it worked (the app
-- showed "Submitted!" and the photo/selfie uploaded fine, since those
-- columns aren't locked) while identity_verification_status silently
-- stayed at its old value the entire time. That explains all three
-- symptoms reported at once: the profile page never left "Not Verified"
-- (because the column genuinely never changed), the admin overview
-- correctly showed 0 pending (because there genuinely were zero rows with
-- status = 'submitted'), and submitting a second time behaved identically
-- to the first, since the app never had any pending state to detect and
-- warn about.
--
-- Fix: identity_verification_status keeps being fully locked for every
-- value except one specific transition - a non-privileged user setting it
-- to 'submitted' - which is exactly what the real submission flow needs
-- to do and the only self-service transition that was ever supposed to be
-- allowed. Setting it to 'approved' or 'rejected' still requires being
-- staff/admin, same as before.
-- ============================================================================

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

  -- The one carved-out exception: self-submission is allowed. Anything
  -- other than moving to 'submitted' still gets reverted for a
  -- non-privileged caller (in particular, 'approved' and 'rejected' can
  -- still only ever be set by staff/admin).
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
$$;

-- ----------------------------------------------------------------------------
-- One-time repair: any account that submitted identity verification while
-- this bug was live had it silently reverted to whatever it was before
-- (most likely NULL, since these are first-time submissions). There is no
-- way to recover which specific accounts tried and got silently reverted -
-- the correct value was never written anywhere to recover from. Anyone
-- affected will need to resubmit once this migration is applied; going
-- forward, the fix above prevents this from happening again.
-- ----------------------------------------------------------------------------
