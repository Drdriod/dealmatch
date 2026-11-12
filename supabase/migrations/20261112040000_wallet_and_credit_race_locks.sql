-- Audit F-020 / F-021: two requests sent at the same moment could both pass the balance check.
-- request_withdrawal read the available balance, then inserted the request, with nothing stopping
-- a second call from reading the same balance in between, so a wallet could be over-withdrawn.
-- spend_unlock_credit had the same shape for unlock credits.
-- Fix: take a per-user lock first (pg_advisory_xact_lock, released at the end of the transaction),
-- so the second call waits and then sees the first call's request or spend. Behaviour is otherwise
-- unchanged.
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount_cents bigint)
RETURNS withdrawal_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_available BIGINT;
  v_payout public.payout_accounts%ROWTYPE;
  v_req public.withdrawal_requests%ROWTYPE;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'withdrawal amount must be greater than zero';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'must be signed in to request a withdrawal';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('withdrawal:' || auth.uid()::text, 0));

  SELECT * INTO v_payout FROM public.payout_accounts
   WHERE profile_id = auth.uid() AND status = 'verified' ORDER BY verified_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no verified payout account on file, add one before requesting a withdrawal';
  END IF;

  v_available := public.available_wallet_balance(auth.uid());
  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'requested amount (%) exceeds available balance (%)', p_amount_cents, v_available;
  END IF;

  INSERT INTO public.withdrawal_requests (profile_id, amount_cents, payout_account_id)
  VALUES (auth.uid(), p_amount_cents, v_payout.id) RETURNING * INTO v_req;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (auth.uid(), 'withdrawal_requested', 'Withdrawal requested',
          'Your request for NGN ' || to_char(p_amount_cents / 100.0, 'FM999,999,999.00') || ' is being reviewed.',
          '/wallet');
  RETURN v_req;
END;
$function$;

CREATE OR REPLACE FUNCTION public.spend_unlock_credit(p_target_type text, p_target_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_balance INTEGER;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_target_type NOT IN ('property','provider') THEN RAISE EXCEPTION 'Invalid target type'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('unlock:' || v_caller::text, 0));

  -- Idempotent: already unlocked this exact contact -> succeed without spending again.
  IF EXISTS (SELECT 1 FROM public.contact_unlocks
              WHERE buyer_id = v_caller AND target_type = p_target_type AND target_id = p_target_id) THEN
    RETURN true;
  END IF;

  SELECT public.get_unlock_credit_balance(v_caller) INTO v_balance;
  IF v_balance < 1 THEN RAISE EXCEPTION 'Not enough unlock credits'; END IF;

  INSERT INTO public.contact_unlocks (buyer_id, target_type, target_id) VALUES (v_caller, p_target_type, p_target_id);
  INSERT INTO public.unlock_credit_ledger (profile_id, entry_type, credits, target_type, target_id)
  VALUES (v_caller, 'spent', 1, p_target_type, p_target_id);
  RETURN true;
END;
$function$;
