-- ============================================================================
-- Platform fees registry: every monetisation channel in one table, changed
-- only from the super admin page, read by the escrow functions and by the app.
--
--   * platform_fees          one row per channel (key, label, value, on/off)
--   * platform_fee_history   every change, who made it and when
--   * get_platform_fee(key)  the value the database uses (raises if missing/off)
--   * admin_set_platform_fee / admin_create_platform_fee
--                            admin-only writes; every change notifies all
--                            active users
--
-- Escrow: start_property_escrow_payment reads its rate here and records it on
-- the escrow row. fn_calculate_revenue_split then splits the rate recorded on
-- that row, so a later change never alters a deal already in progress.
--
-- Percent values are whole percents (3.00 = 3% of the deal, split half from
-- each side). Flat values are naira.
-- ============================================================================

-- 1. Tables -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_fees (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{3,60}$'),
  label        TEXT NOT NULL,
  description  TEXT,
  area         TEXT NOT NULL CHECK (area IN ('place', 'people', 'other')),
  kind         TEXT NOT NULL CHECK (kind IN ('percent', 'flat_ngn')),
  value        NUMERIC(14,2) NOT NULL CHECK (value >= 0),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_fees_updated_by ON public.platform_fees (updated_by);

CREATE TABLE IF NOT EXISTS public.platform_fee_history (
  id          BIGSERIAL PRIMARY KEY,
  fee_key     TEXT NOT NULL REFERENCES public.platform_fees(key) ON DELETE CASCADE,
  old_value   NUMERIC(14,2),
  new_value   NUMERIC(14,2),
  old_active  BOOLEAN,
  new_active  BOOLEAN,
  note        TEXT,
  changed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_history_key ON public.platform_fee_history (fee_key, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_fee_history_changed_by ON public.platform_fee_history (changed_by);

-- 2. Seed the channels the app charges today (values from the code, see notes) --
INSERT INTO public.platform_fees (key, label, description, area, kind, value) VALUES
  ('rental_escrow',         'Rent protection (escrow)',          'Fee on a rent paid through escrow. Split half from the tenant and half from the landlord.', 'place',  'percent', 3.00),
  ('sale_escrow',           'Sale protection (escrow)',          'Fee on a sale paid through escrow. Split half from the buyer and half from the seller.',    'place',  'percent', 3.00),
  ('hotel_booking',         'Hotel and short-let booking fee',   'Added to the guest total on a hotel or short-let booking.',                                   'place',  'percent', 8.00),
  ('hostel_listing_semester','Student hostel listing: semester', 'Owner pays to go live for about six months.',                                                  'place',  'flat_ngn', 5000),
  ('hostel_listing_annual', 'Student hostel listing: annual',    'Owner pays to go live for twelve months.',                                                    'place',  'flat_ngn', 8500),
  ('professional_monthly',  'Professional subscription: monthly','Monthly plan for verified professionals.',                                                    'people', 'flat_ngn', 25000),
  ('professional_annual',   'Professional subscription: annual', 'Annual plan for verified professionals.',                                                     'people', 'flat_ngn', 270000),
  ('unlock_credit_single',  'Contact unlock: one credit',        'One credit unlocks one contact, for good.',                                                   'other',  'flat_ngn', 500),
  ('unlock_credit_pack_5',  'Contact unlock: pack of five',      'Five credits for the price of a discounted bundle.',                                          'other',  'flat_ngn', 2000),
  ('job_escrow',            'Job escrow commission',             'Commission on a job held in escrow. Not charged yet: the rate is still to be decided.',       'people', 'percent', 0.00)
ON CONFLICT (key) DO NOTHING;

-- 3. Security -----------------------------------------------------------------
ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_history ENABLE ROW LEVEL SECURITY;

-- Everyone can read the rates, because the app shows them before a payment.
CREATE POLICY platform_fees_read ON public.platform_fees FOR SELECT USING (true);

-- Only admins can read the history. Nobody writes the tables directly: all
-- changes go through the admin functions below.
CREATE POLICY platform_fee_history_admin_read ON public.platform_fee_history
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.platform_fees FROM PUBLIC;
REVOKE ALL ON public.platform_fee_history FROM PUBLIC;
GRANT SELECT ON public.platform_fees TO anon, authenticated;
GRANT SELECT ON public.platform_fee_history TO authenticated;

-- 4. Helper: the value the database uses -----------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_fee(p_key TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value NUMERIC;
BEGIN
  SELECT value INTO v_value
    FROM public.platform_fees
   WHERE key = p_key AND is_active;

  IF v_value IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_FEE_NOT_ACTIVE: fee "%" is missing or switched off', p_key;
  END IF;
  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_fee(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_fee(TEXT) TO authenticated, service_role;

-- 5. Helper: a readable value for notifications ---------------------------
CREATE OR REPLACE FUNCTION public.format_platform_fee(p_kind TEXT, p_value NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_kind = 'percent' THEN
      CASE WHEN p_value = trunc(p_value) THEN trunc(p_value)::text
           ELSE rtrim(rtrim(p_value::text, '0'), '.') END || '%'
    ELSE '₦' || to_char(p_value, 'FM999,999,990')
  END;
$$;

-- 6. Admin: change a fee and tell every active user ------------------------
CREATE OR REPLACE FUNCTION public.admin_set_platform_fee(
  p_key       TEXT,
  p_value     NUMERIC,
  p_is_active BOOLEAN,
  p_note      TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        public.platform_fees%ROWTYPE;
  v_msg    TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change platform fees';
  END IF;
  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'A fee cannot be negative';
  END IF;

  SELECT * INTO r FROM public.platform_fees WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown fee: %', p_key;
  END IF;
  IF r.kind = 'percent' AND p_value > 20 THEN
    RAISE EXCEPTION 'A percentage fee above 20%% is not allowed';
  END IF;
  IF r.value = p_value AND r.is_active = p_is_active THEN
    RETURN; -- nothing changed, so nothing to announce
  END IF;

  UPDATE public.platform_fees
     SET value = p_value, is_active = p_is_active, updated_at = now(), updated_by = auth.uid()
   WHERE key = p_key;

  INSERT INTO public.platform_fee_history
    (fee_key, old_value, new_value, old_active, new_active, note, changed_by)
  VALUES
    (p_key, r.value, p_value, r.is_active, p_is_active, p_note, auth.uid());

  IF NOT p_is_active THEN
    v_msg := r.label || ' is switched off for now.';
  ELSIF NOT r.is_active THEN
    v_msg := r.label || ' is switched back on at ' || public.format_platform_fee(r.kind, p_value) || '.';
  ELSE
    v_msg := r.label || ' changed from ' || public.format_platform_fee(r.kind, r.value)
          || ' to ' || public.format_platform_fee(r.kind, p_value)
          || '. It applies to new payments from now on.';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT id, 'platform_fee_changed', 'Our fees have been updated', v_msg, '/terms'
    FROM public.profiles
   WHERE COALESCE(is_deactivated, false) = false;
END;
$$;

-- 7. Admin: add a new monetisation channel ---------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_platform_fee(
  p_key         TEXT,
  p_label       TEXT,
  p_area        TEXT,
  p_kind        TEXT,
  p_value       NUMERIC,
  p_description TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can add platform fees';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9_]{3,60}$' THEN
    RAISE EXCEPTION 'Key must be 3 to 60 lowercase letters, digits or underscores';
  END IF;
  IF p_label IS NULL OR btrim(p_label) = '' THEN
    RAISE EXCEPTION 'A label is required';
  END IF;

  INSERT INTO public.platform_fees (key, label, description, area, kind, value, updated_by)
  VALUES (p_key, btrim(p_label), p_description, p_area, p_kind, COALESCE(p_value, 0), auth.uid());

  INSERT INTO public.platform_fee_history (fee_key, new_value, new_active, note, changed_by)
  VALUES (p_key, COALESCE(p_value, 0), true, 'Channel added', auth.uid());

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT id, 'platform_fee_changed', 'New fee added',
         btrim(p_label) || ' is now a DealMatch fee at ' || public.format_platform_fee(p_kind, COALESCE(p_value, 0)) || '.',
         '/terms'
    FROM public.profiles
   WHERE COALESCE(is_deactivated, false) = false;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_platform_fee(TEXT, NUMERIC, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_platform_fee(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_fee(TEXT, NUMERIC, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_platform_fee(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;

-- 8. Escrow: read the rate when a payment starts, and record it on the row --
CREATE OR REPLACE FUNCTION public.start_property_escrow_payment(
  p_property_id      uuid,
  p_reference        text,
  p_transaction_type text,
  p_gross_amount     numeric,
  p_tenant_name      text,
  p_tenant_phone     text,
  p_move_in_date     date DEFAULT NULL::date
)
RETURNS public.escrow_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_seller_id     UUID;
  v_rate          NUMERIC;   -- total fee, whole percent, e.g. 3.00
  v_fee_per_party NUMERIC;
  v_row           public.escrow_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to start an escrow payment';
  END IF;
  IF p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'A valid amount is required';
  END IF;
  IF p_transaction_type NOT IN ('rental', 'sale', 'hotel') THEN
    RAISE EXCEPTION 'transaction_type must be rental, sale, or hotel';
  END IF;

  SELECT seller_id INTO v_seller_id FROM public.properties WHERE id = p_property_id;
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'property % not found', p_property_id;
  END IF;

  -- The rate comes from the platform_fees table, not from a number in code.
  v_rate := CASE p_transaction_type
              WHEN 'sale'  THEN public.get_platform_fee('sale_escrow')
              WHEN 'hotel' THEN public.get_platform_fee('hotel_booking')
              ELSE              public.get_platform_fee('rental_escrow')
            END;

  -- Half of the total fee comes from each side.
  v_fee_per_party := ROUND(p_gross_amount * (v_rate / 200), 2);

  INSERT INTO public.escrow_transactions (
    property_id, buyer_id, seller_id, tenant_id, status, transaction_type,
    gross_amount, platform_pct, platform_amount,
    fee_from_tenant, fee_from_landlord, landlord_receives,
    move_in_date, payment_ref
  ) VALUES (
    p_property_id, auth.uid(), v_seller_id, auth.uid(), 'awaiting_payment', p_transaction_type,
    p_gross_amount, v_rate / 100, v_fee_per_party * 2,
    v_fee_per_party, v_fee_per_party, p_gross_amount - v_fee_per_party,
    p_move_in_date, p_reference
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 9. Escrow: split the rate recorded on the row (rental and sale) -------------
CREATE OR REPLACE FUNCTION public.fn_calculate_revenue_split(p_escrow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  esc         public.escrow_transactions%ROWTYPE;
  v_total     numeric;   -- total fee as a fraction, snapshot taken when the payment started
  v_pool      numeric;
  plat_amt    numeric;
  agent_amt   numeric;
  ref_amt     numeric;
  owner_amt   numeric;
  ref_id      uuid;
BEGIN
  SELECT * INTO esc
  FROM public.escrow_transactions
  WHERE id = p_escrow_id
  FOR UPDATE;

  IF esc.payout_locked THEN
    RAISE EXCEPTION 'Payout already processed for escrow %', p_escrow_id;
  END IF;

  UPDATE public.escrow_transactions
  SET payout_locked = true
  WHERE id = p_escrow_id;

  -- Rate recorded when the payment started. Falls back to the current rate
  -- only for rows created before this snapshot existed.
  v_total := COALESCE(esc.platform_pct,
               CASE WHEN esc.transaction_type = 'sale'
                    THEN public.get_platform_fee('sale_escrow')
                    ELSE public.get_platform_fee('rental_escrow') END / 100);
  v_pool := ROUND(esc.gross_amount * v_total, 2);

  IF esc.transaction_type = 'rental' THEN
    -- Fee pool split: 65% platform, 25% agent, 10% referrer
    plat_amt  := ROUND(v_pool * 0.65, 2);
    agent_amt := ROUND(v_pool * 0.25, 2);
    ref_amt   := ROUND(v_pool * 0.10, 2);
    owner_amt := esc.gross_amount - ROUND(esc.gross_amount * v_total / 2, 2);

    UPDATE public.escrow_transactions SET
      platform_pct      = v_total,
      platform_amount   = plat_amt,
      agent_pct         = 0.25,
      agent_payout      = agent_amt,
      referral_pct      = 0.10,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt,
      fee_from_tenant   = ROUND(esc.gross_amount * v_total / 2, 2),
      fee_from_landlord = ROUND(esc.gross_amount * v_total / 2, 2)
    WHERE id = p_escrow_id;

  ELSIF esc.transaction_type = 'sale' THEN
    -- Fee pool split: 60% platform, 30% agent, 10% referrer
    plat_amt  := ROUND(v_pool * 0.60, 2);
    agent_amt := ROUND(v_pool * 0.30, 2);
    ref_amt   := ROUND(v_pool * 0.10, 2);
    owner_amt := esc.gross_amount - ROUND(esc.gross_amount * v_total / 2, 2);

    UPDATE public.escrow_transactions SET
      platform_pct      = v_total,
      platform_amount   = plat_amt,
      agent_pct         = 0.30,
      agent_payout      = agent_amt,
      referral_pct      = 0.10,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt,
      fee_from_tenant   = ROUND(esc.gross_amount * v_total / 2, 2),
      fee_from_landlord = ROUND(esc.gross_amount * v_total / 2, 2)
    WHERE id = p_escrow_id;

  ELSIF esc.transaction_type = 'hotel' THEN
    -- Hotel split is unchanged by this migration: 10% platform, 2% referrer.
    plat_amt  := ROUND(esc.gross_amount * 0.10, 2);
    ref_amt   := ROUND(esc.gross_amount * 0.02, 2);
    owner_amt := esc.gross_amount - plat_amt - ref_amt;

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.10,
      platform_amount   = plat_amt,
      agent_pct         = 0,
      agent_payout      = 0,
      referral_pct      = 0.02,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt
    WHERE id = p_escrow_id;
  END IF;

  SELECT * INTO esc FROM public.escrow_transactions WHERE id = p_escrow_id;

  SELECT p.referred_by INTO ref_id
  FROM public.properties pr
  JOIN public.profiles p ON p.id = pr.seller_id
  WHERE pr.id = esc.property_id
  LIMIT 1;

  -- Platform
  INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
  SELECT p_escrow_id, id, 'platform', esc.platform_amount,
    'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-PLT'
  FROM public.profiles
  WHERE role = 'superadmin' ORDER BY id
  LIMIT 1;

  -- Agent
  IF esc.agent_id IS NOT NULL AND esc.agent_payout > 0 THEN
    INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
    VALUES (p_escrow_id, esc.agent_id, 'agent', esc.agent_payout,
      'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-AGT');
  END IF;

  -- Referrer
  IF ref_id IS NOT NULL AND esc.referral_payout > 0 THEN
    INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
    VALUES (p_escrow_id, ref_id,
      CASE esc.transaction_type WHEN 'hotel' THEN 'referrer' ELSE 'referrer' END,
      esc.referral_payout,
      'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-REF');
  END IF;

  -- Owner / Landlord / Seller / Hotel
  DECLARE
    owner_uid uuid := COALESCE(esc.seller_id,
      (SELECT seller_id FROM public.properties WHERE id = esc.property_id LIMIT 1));
  BEGIN
    IF owner_uid IS NOT NULL THEN
      INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
      VALUES (p_escrow_id, owner_uid,
        CASE esc.transaction_type
          WHEN 'rental' THEN 'landlord'
          WHEN 'sale'   THEN 'seller'
          ELSE 'hotel_owner'
        END,
        esc.landlord_receives,
        'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-OWN');
    END IF;
  END;

  UPDATE public.escrow_transactions
  SET payout_processed_at = now()
  WHERE id = p_escrow_id;
END;
$function$;
