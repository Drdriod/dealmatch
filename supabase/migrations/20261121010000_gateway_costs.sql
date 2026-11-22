-- Gateway (Flutterwave) costs: configurable rates and a per-payment estimate ledger.
--
-- The seeded figures come from Flutterwave's published Nigeria pricing page (flutterwave.com/ng/pricing,
-- read 2026-11-21, page undated): bank-transfer collections 2% per transaction; transfers to bank
-- accounts NGN 10 (up to 5,000), NGN 25 (5,001 to 50,000), NGN 50 (above 50,000); fees carry 7.5% VAT.
-- They are published rates, NOT confirmed against DealMatch's own agreement. Edit them in Admin >
-- Finance when the real contract or settlement report says otherwise. Rows in the ledger are marked
-- estimated and keep the rates that applied when they were written.
CREATE TABLE IF NOT EXISTS public.gateway_fee_settings (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  unit        text NOT NULL CHECK (unit IN ('percent', 'naira')),
  value       numeric(12,2) NOT NULL CHECK (value >= 0),
  note        text,
  sort_order  int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.gateway_fee_settings (key, label, unit, value, note, sort_order) VALUES
  ('collection_pct',        'Bank-transfer collection fee',            'percent', 2.00, 'Published rate: 2% per transaction. Not confirmed against our agreement.', 10),
  ('collection_cap_naira',  'Collection fee cap (0 = no cap)',          'naira',   0.00, 'No cap is stated on the published page. Set one if your agreement has it.', 20),
  ('payout_tier1_max_naira','Payout tier 1 upper limit',                'naira',   5000, 'Transfers up to this amount pay the tier 1 fee.', 30),
  ('payout_tier1_fee_naira','Payout fee, tier 1',                       'naira',   10,   'Published: NGN 10 for transfers of NGN 5,000 and below.', 40),
  ('payout_tier2_max_naira','Payout tier 2 upper limit',                'naira',   50000,'Transfers above tier 1 up to this amount pay the tier 2 fee.', 50),
  ('payout_tier2_fee_naira','Payout fee, tier 2',                       'naira',   25,   'Published: NGN 25 for NGN 5,001 to NGN 50,000.', 60),
  ('payout_tier3_fee_naira','Payout fee, above tier 2',                 'naira',   50,   'Published: NGN 50 above NGN 50,000.', 70),
  ('fee_vat_pct',           'VAT the gateway adds to its fees',         'percent', 7.50, 'Published: transaction fees are subject to 7.5% VAT. Recoverable only if DealMatch is VAT-registered: ask the accountant.', 80)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.gateway_fee_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read gateway fee settings" ON public.gateway_fee_settings;
CREATE POLICY "Admins read gateway fee settings" ON public.gateway_fee_settings FOR SELECT USING (public.is_admin() OR public.is_superadmin());
REVOKE INSERT, UPDATE, DELETE ON public.gateway_fee_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_gateway_fee_setting(p_key text, p_value numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old numeric; v_unit text;
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'only the owner can change gateway fee settings' USING ERRCODE = '42501'; END IF;
  SELECT value, unit INTO v_old, v_unit FROM public.gateway_fee_settings WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown setting %', p_key; END IF;
  IF p_value IS NULL OR p_value < 0 OR (v_unit = 'percent' AND p_value > 100) THEN RAISE EXCEPTION 'invalid value'; END IF;
  UPDATE public.gateway_fee_settings SET value = round(p_value, 2), updated_at = now(), updated_by = auth.uid() WHERE key = p_key;
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES ('gateway_fee_setting_changed', jsonb_build_object('key', p_key, 'old', v_old, 'new', round(p_value, 2)), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.admin_set_gateway_fee_setting(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_gateway_fee_setting(text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public._gw(p_key text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT COALESCE((SELECT value FROM public.gateway_fee_settings WHERE key = p_key), 0) $$;
REVOKE ALL ON FUNCTION public._gw(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._gw(text) TO service_role;

-- Estimated gateway fee in kobo for a collection or a payout of p_base_kobo.
CREATE OR REPLACE FUNCTION public.gateway_fee_kobo(p_kind text, p_base_kobo bigint)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_fee numeric; v_cap numeric; v_naira numeric := p_base_kobo / 100.0;
BEGIN
  IF p_base_kobo IS NULL OR p_base_kobo <= 0 THEN RETURN 0; END IF;
  IF p_kind = 'collection' THEN
    v_fee := p_base_kobo * public._gw('collection_pct') / 100;
    v_cap := public._gw('collection_cap_naira') * 100;
    IF v_cap > 0 AND v_fee > v_cap THEN v_fee := v_cap; END IF;
    RETURN round(v_fee);
  ELSIF p_kind = 'payout' THEN
    RETURN round(100 * CASE WHEN v_naira <= public._gw('payout_tier1_max_naira') THEN public._gw('payout_tier1_fee_naira')
                            WHEN v_naira <= public._gw('payout_tier2_max_naira') THEN public._gw('payout_tier2_fee_naira')
                            ELSE public._gw('payout_tier3_fee_naira') END);
  END IF;
  RAISE EXCEPTION 'kind must be collection or payout';
END $$;
REVOKE ALL ON FUNCTION public.gateway_fee_kobo(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_fee_kobo(text, bigint) TO service_role;

CREATE TABLE IF NOT EXISTS public.gateway_cost_ledger (
  id         bigserial PRIMARY KEY,
  reference  text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('collection', 'payout')),
  base_kobo  bigint NOT NULL CHECK (base_kobo >= 0),
  fee_kobo   bigint NOT NULL CHECK (fee_kobo >= 0),
  vat_kobo   bigint NOT NULL CHECK (vat_kobo >= 0),
  estimated  boolean NOT NULL DEFAULT true,
  rates      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gateway_cost_one_per_reference_kind ON public.gateway_cost_ledger (reference, kind);
CREATE INDEX IF NOT EXISTS gateway_cost_created ON public.gateway_cost_ledger (created_at);
ALTER TABLE public.gateway_cost_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read gateway costs" ON public.gateway_cost_ledger;
CREATE POLICY "Admins read gateway costs" ON public.gateway_cost_ledger FOR SELECT USING (public.is_admin() OR public.is_superadmin());
REVOKE INSERT, UPDATE, DELETE ON public.gateway_cost_ledger FROM anon, authenticated;

-- Written by the server when money is received or sent. Safe to repeat for the same reference.
CREATE OR REPLACE FUNCTION public.record_gateway_cost(p_reference text, p_kind text, p_base_kobo bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_fee bigint := public.gateway_fee_kobo(p_kind, p_base_kobo);
BEGIN
  INSERT INTO public.gateway_cost_ledger (reference, kind, base_kobo, fee_kobo, vat_kobo, rates)
  VALUES (p_reference, p_kind, GREATEST(p_base_kobo, 0), v_fee, round(v_fee * public._gw('fee_vat_pct') / 100),
          (SELECT jsonb_object_agg(key, value) FROM public.gateway_fee_settings))
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.record_gateway_cost(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_gateway_cost(text, text, bigint) TO service_role;

-- Gateway figures for the Finance tab.
CREATE OR REPLACE FUNCTION public.admin_finance_gateway(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_superadmin()) THEN RAISE EXCEPTION 'only an administrator' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'collection_fee_kobo', COALESCE(sum(fee_kobo) FILTER (WHERE kind = 'collection'), 0),
    'payout_fee_kobo',     COALESCE(sum(fee_kobo) FILTER (WHERE kind = 'payout'), 0),
    'fee_total_kobo',      COALESCE(sum(fee_kobo), 0),
    'vat_on_fees_kobo',    COALESCE(sum(vat_kobo), 0),
    'received_kobo',       COALESCE(sum(base_kobo) FILTER (WHERE kind = 'collection'), 0),
    'collections',         count(*) FILTER (WHERE kind = 'collection'),
    'payouts',             count(*) FILTER (WHERE kind = 'payout'),
    'estimated',           COALESCE(bool_or(estimated), false))
  INTO r FROM public.gateway_cost_ledger WHERE created_at >= p_from AND created_at < p_to;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_finance_gateway(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_gateway(timestamptz, timestamptz) TO authenticated;
