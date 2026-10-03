-- ============================================================================
-- Account deletion (required by Google Play and the Apple App Store).
--
-- Design: "erase personal data, keep transaction records".
-- auth.users is NEVER hard-deleted: wallet_ledger, escrow_transactions,
-- transactions, payments and the commission ledger reference it, several
-- with ON DELETE CASCADE, so a hard delete would erase financial history we
-- must keep for accounting and dispute purposes. Instead the profile is
-- scrubbed of personal data and marked deleted, and the auth user is
-- anonymised and banned by the API layer (api/platform.js, resource
-- delete-account) using the service role.
--
-- Deletion is refused while money is in flight (funded escrow, pending
-- payouts, withdrawals, positive wallet balance).
-- ============================================================================

-- 1. Which things block a deletion right now? Returns a jsonb array of
--    human-readable reasons; empty array means deletion may proceed.
CREATE OR REPLACE FUNCTION public.account_deletion_blockers(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reasons JSONB := '[]'::jsonb;
  v_n BIGINT;
BEGIN
  SELECT count(*) INTO v_n FROM public.transactions
   WHERE (requester_id = p_user OR provider_id = p_user)
     AND status IN ('PENDING', 'FUNDED', 'DISPUTED');
  IF v_n > 0 THEN
    v_reasons := v_reasons || to_jsonb(v_n || ' deal(s) are still in progress or in dispute. Complete or cancel them first.');
  END IF;

  SELECT count(*) INTO v_n FROM public.escrow_transactions
   WHERE (buyer_id = p_user OR seller_id = p_user OR tenant_id = p_user
          OR agent_id = p_user OR referrer_id = p_user)
     AND status IN ('funded', 'held', 'disputed', 'processing');
  IF v_n > 0 THEN
    v_reasons := v_reasons || to_jsonb(v_n || ' escrow payment(s) are still held. Wait for release or resolution first.');
  END IF;

  SELECT count(*) INTO v_n FROM public.wallet_ledger
   WHERE recipient_id = p_user AND status IN ('pending', 'processing');
  IF v_n > 0 THEN
    v_reasons := v_reasons || to_jsonb(v_n || ' payout(s) are still being processed.');
  END IF;

  SELECT count(*) INTO v_n FROM public.withdrawal_requests
   WHERE profile_id = p_user AND status = 'pending';
  IF v_n > 0 THEN
    v_reasons := v_reasons || to_jsonb('You have a pending withdrawal request.'::text);
  END IF;

  SELECT count(*) INTO v_n FROM public.payout_queue
   WHERE profile_id = p_user AND status IN ('pending', 'processing');
  IF v_n > 0 THEN
    v_reasons := v_reasons || to_jsonb('You have a payout being sent to your bank.'::text);
  END IF;

  IF COALESCE(public.available_wallet_balance(p_user), 0) > 0 THEN
    v_reasons := v_reasons || to_jsonb('You still have money in your wallet. Withdraw it first.'::text);
  END IF;

  RETURN v_reasons;
END;
$$;

-- 2. Erase personal data. Service role only: the API verifies the caller's
--    session, then calls this with the service client.
CREATE OR REPLACE FUNCTION public.erase_account_data(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blockers JSONB;
  v_role TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF v_role IN ('admin', 'superadmin') THEN
    RETURN jsonb_build_object('ok', false, 'blockers',
      jsonb_build_array('Staff accounts must be removed by another administrator.'));
  END IF;

  v_blockers := public.account_deletion_blockers(p_user);
  IF jsonb_array_length(v_blockers) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'blockers', v_blockers);
  END IF;

  -- Open requests the user created simply close.
  UPDATE public.transactions SET status = 'CANCELLED', updated_at = now()
   WHERE requester_id = p_user AND status = 'OPEN';

  -- Scrub personal data. Financial rows keep pointing at this id, which is
  -- now an anonymous shell.
  UPDATE public.profiles SET
    full_name = 'Deleted user',
    email = NULL,
    phone = NULL,
    avatar_url = NULL,
    location = NULL,
    bio = NULL,
    state = NULL,
    city = NULL,
    username = NULL,
    buyer_preferences = '{}'::jsonb,
    id_doc_url = NULL,
    id_doc_type = NULL,
    face_video_url = NULL,
    bank_name = NULL,
    account_number = NULL,
    account_name = NULL,
    routing_number = NULL,
    identity_photo_url = NULL,
    identity_selfie_url = NULL,
    identity_doc_type = NULL,
    device_fingerprint = NULL,
    invite_code = NULL,
    student_institution = NULL,
    is_deactivated = true,
    account_status = 'deleted',
    updated_at = now()
   WHERE id = p_user;

  -- Bank details are personal data. The rows stay (payout history refers to
  -- them) but the account details are blanked.
  UPDATE public.payout_accounts SET
    bank_name = 'removed',
    account_number = 'removed',
    account_name = 'removed',
    gateway_recipient_code = NULL,
    updated_at = now()
   WHERE profile_id = p_user;

  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES ('account_deleted_by_user', jsonb_build_object('profile_id', p_user), p_user);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.erase_account_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_account_data(UUID) TO service_role;

-- Safe to expose to the signed-in user: lets the UI explain what is blocking.
CREATE OR REPLACE FUNCTION public.my_account_deletion_blockers()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.account_deletion_blockers(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.account_deletion_blockers(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_blockers(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.my_account_deletion_blockers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_deletion_blockers() TO authenticated;
