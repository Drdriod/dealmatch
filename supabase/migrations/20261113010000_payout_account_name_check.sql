-- Payout account name vs profile name.
-- When someone submits a payout account, compare the bank's account name with the name on their
-- DealMatch profile and record the result, so the admin review can see and prioritise mismatches.
-- Every account is still reviewed by staff before it can be paid into; this only adds the flag.

CREATE OR REPLACE FUNCTION public.payout_names_match(a text, b text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  ta text[];
  tb text[];
  small text[];
  big text[];
BEGIN
  ta := ARRAY(SELECT DISTINCT w FROM unnest(string_to_array(trim(regexp_replace(regexp_replace(lower(coalesce(a,'')), '[''’]', '', 'g'), '[^a-z ]', ' ', 'g')), ' ')) AS w WHERE length(w) > 0);
  tb := ARRAY(SELECT DISTINCT w FROM unnest(string_to_array(trim(regexp_replace(regexp_replace(lower(coalesce(b,'')), '[''’]', '', 'g'), '[^a-z ]', ' ', 'g')), ' ')) AS w WHERE length(w) > 0);
  IF cardinality(ta) < 2 OR cardinality(tb) < 2 THEN RETURN false; END IF;
  IF cardinality(ta) <= cardinality(tb) THEN small := ta; big := tb; ELSE small := tb; big := ta; END IF;
  -- Order does not matter and extra middle names are fine: every word of the shorter name must appear in the longer.
  RETURN small <@ big;
END;
$$;

ALTER TABLE public.payout_accounts
  ADD COLUMN IF NOT EXISTS name_check text
  CHECK (name_check IN ('match', 'mismatch', 'no_profile_name'));

CREATE OR REPLACE FUNCTION public.submit_payout_account(
  p_bank_name TEXT,
  p_account_number TEXT,
  p_account_name TEXT,
  p_bank_code TEXT DEFAULT NULL,
  p_gateway public.payout_gateway DEFAULT 'flutterwave'
) RETURNS public.payout_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payout_accounts%ROWTYPE;
  v_profile_name text;
  v_check text;
BEGIN
  IF COALESCE(TRIM(p_bank_name), '') = '' OR COALESCE(TRIM(p_account_number), '') = '' OR COALESCE(TRIM(p_account_name), '') = '' THEN
    RAISE EXCEPTION 'bank name, account number and account name are all required';
  END IF;

  SELECT full_name INTO v_profile_name FROM public.profiles WHERE id = auth.uid();
  v_check := CASE
    WHEN COALESCE(TRIM(v_profile_name), '') = '' THEN 'no_profile_name'
    WHEN public.payout_names_match(v_profile_name, p_account_name) THEN 'match'
    ELSE 'mismatch'
  END;

  DELETE FROM public.payout_accounts WHERE profile_id = auth.uid() AND status = 'pending';

  INSERT INTO public.payout_accounts (profile_id, gateway, bank_name, bank_code, account_number, account_name, status, name_check)
  VALUES (auth.uid(), p_gateway, TRIM(p_bank_name), NULLIF(TRIM(p_bank_code), ''), TRIM(p_account_number), TRIM(p_account_name), 'pending', v_check)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payout_account(TEXT, TEXT, TEXT, TEXT, public.payout_gateway) TO authenticated;
