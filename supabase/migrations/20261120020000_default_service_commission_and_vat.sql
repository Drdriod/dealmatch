-- Revenue leak: marketplace jobs earned DealMatch nothing, because the `commissions` table was empty
-- and accept_bid never invents a rate. Seed the platform-wide default at 3% of the agreed job price.
-- The owner can change or schedule it from Admin > Commission schedules.
INSERT INTO public.commissions (name, description, percentage_rate, fixed_fee_cents, target_category_id, status, effective_date, is_default)
SELECT 'Standard service commission', '3% of the agreed job price, taken from the provider''s payout.', 3.00, 0, NULL, 'ACTIVE', now(), true
WHERE NOT EXISTS (SELECT 1 FROM public.commissions WHERE status = 'ACTIVE' AND target_category_id IS NULL);

-- When the job is released, VAT (if switched on) on DealMatch's commission is held back from the
-- provider's payout and recorded as tax owed. The commission itself is unchanged.
CREATE OR REPLACE FUNCTION public.release_held_payment(p_transaction_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tx     public.transactions%ROWTYPE;
  v_amount BIGINT;
  v_comm   BIGINT;
  v_vat    BIGINT := 0;
  v_rate   NUMERIC;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND OR v_tx.provider_id IS NULL THEN
    RETURN;
  END IF;

  v_comm := COALESCE(v_tx.commission_amount_cents, 0);
  v_rate := public.get_tax_rate('vat');
  IF v_rate > 0 AND v_comm > 0 THEN
    v_vat := ROUND(v_comm * v_rate / 100);
  END IF;

  v_amount := COALESCE(v_tx.amount_cents, 0) - v_comm - v_vat;
  IF v_amount <= 0 THEN
    RETURN;
  END IF;

  IF v_vat > 0 THEN
    INSERT INTO public.tax_ledger (reference, kind, purpose, base_kobo, rate_pct, tax_kobo, profile_id)
    VALUES ('tx:' || v_tx.id, 'vat', 'job_commission', v_comm, v_rate, v_vat, v_tx.provider_id)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.commission_wallet_ledger (profile_id, transaction_id, entry_type, amount_cents)
  VALUES (v_tx.provider_id, v_tx.id, 'held', v_amount);

  INSERT INTO public.payout_queue (transaction_id, profile_id, payout_account_id, amount_cents)
  VALUES (v_tx.id, v_tx.provider_id, v_tx.provider_payout_account_id, v_amount)
  ON CONFLICT (transaction_id) DO NOTHING;

  UPDATE public.transactions SET payout_status = 'queued' WHERE id = v_tx.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.release_held_payment(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_held_payment(bigint) TO service_role;
