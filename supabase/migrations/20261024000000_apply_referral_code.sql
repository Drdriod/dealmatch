-- 21. apply_referral_code: link a new account to the person whose referral code they entered.
--
-- Why
--   The signup page checked a referral (invite) code as you typed and kept it in the browser, but
--   nothing ever wrote profiles.invited_by. Browsers cannot write that column (the profile guard
--   trigger puts the old value back), so no account has ever been linked to a referrer. On
--   production, 17 profiles, 0 with a referrer. The referral chain that pays 8 / 4 / 2 percent walks
--   invited_by, so nobody has been able to earn.
--
-- What it does
--   One function the signed-in user calls once, right after their email is confirmed (or after
--   Google sign-in). It sets invited_by on THEIR OWN profile, only if:
--     * they are signed in and have a profile,
--     * invited_by is still empty (a referrer is never replaced),
--     * the account is less than 7 days old,
--     * the code belongs to another, active account (not their own),
--     * the referrer's own chain does not lead back to this account (no loops).
--   It returns a word, never an error, for the ordinary refusals:
--     applied, already_set, too_late, invalid, self, no_profile.
--   It does not reveal who owns a code beyond what validate-invite already shows.
--
-- What it does not change
--   The profile guard trigger, the grants on profiles, or how the chain pays. It uses the same
--   trusted-grant switch the staff invite flow uses, set for this one statement only.
--
-- No DROP statements. Paste as is, no BEGIN or ROLLBACK.

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_clean   text := lower(btrim(coalesce(p_code, '')));
  v_me      record;
  v_ref     uuid;
  v_walk    uuid;
  v_depth   int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  IF v_clean !~ '^[a-z0-9]{6,12}$' THEN
    RETURN 'invalid';
  END IF;

  SELECT id, invited_by, created_at INTO v_me
    FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_profile';
  END IF;
  IF v_me.invited_by IS NOT NULL THEN
    RETURN 'already_set';
  END IF;
  IF v_me.created_at < now() - interval '7 days' THEN
    RETURN 'too_late';
  END IF;

  SELECT id INTO v_ref
    FROM public.profiles
   WHERE invite_code = v_clean AND COALESCE(is_deactivated, false) = false;
  IF v_ref IS NULL THEN
    RETURN 'invalid';
  END IF;
  IF v_ref = v_uid THEN
    RETURN 'self';
  END IF;

  -- Walk up the referrer's own chain. If it reaches this account, linking would make a loop.
  v_walk := v_ref;
  WHILE v_walk IS NOT NULL AND v_depth < 12 LOOP
    IF v_walk = v_uid THEN
      RETURN 'invalid';
    END IF;
    SELECT invited_by INTO v_walk FROM public.profiles WHERE id = v_walk;
    v_depth := v_depth + 1;
  END LOOP;

  PERFORM set_config('app.trusted_role_grant', 'true', true);
  UPDATE public.profiles SET invited_by = v_ref WHERE id = v_uid AND invited_by IS NULL;
  PERFORM set_config('app.trusted_role_grant', '', true);

  RETURN 'applied';
END;
$$;

COMMENT ON FUNCTION public.apply_referral_code(text) IS
  'Links the signed-in user (new account, no referrer yet) to the owner of a referral code. Returns applied, already_set, too_late, invalid, self or no_profile.';

REVOKE ALL ON FUNCTION public.apply_referral_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;
