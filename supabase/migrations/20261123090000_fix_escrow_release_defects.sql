-- Escrow release defects found in the 23 Nov 2026 audit. Two bugs, no change to any fee or split number.
--
-- 1. fn_calculate_revenue_split read profiles.referred_by, a column that does not exist (the real
--    column is invited_by). Every release, manual or automatic, failed with
--    "column p.referred_by does not exist", so no escrow could ever be released.
-- 2. fn_auto_release_expired_escrows set status = 'released' (which fires trg_post_release_split and
--    runs the split) and then called the split again, which raised "Payout already processed" and
--    rolled the whole release back. The trigger already does the split, so the second call is removed.
--
-- NOT changed here (needs the founder's numbers first): the 65/25/10 and 60/30/10 shares, unused
-- agent and referrer shares staying unallocated, the hotel 10% rate, and the 2.5% in
-- trigger_initialize_escrow. See docs/COMMERCIAL_AUDIT_REPORT.md.
--
-- Fixing defect 1 re-enables the old referrer line in the escrow split. If the referral v2 engine is
-- also live, a referrer could be paid twice for one escrow. Keep referral v2 and escrow funding off
-- until the old line is retired (separate decision).

CREATE OR REPLACE FUNCTION public.fn_calculate_revenue_split(p_escrow_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  esc         public.escrow_transactions%ROWTYPE;
  v_total     numeric;
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

  v_total := COALESCE(esc.platform_pct,
               CASE WHEN esc.transaction_type = 'sale'
                    THEN public.get_platform_fee('sale_escrow')
                    ELSE public.get_platform_fee('rental_escrow') END / 100);
  v_pool := ROUND(esc.gross_amount * v_total, 2);

  IF esc.transaction_type = 'rental' THEN
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

  -- Fix 1: the column is invited_by (was the nonexistent referred_by).
  SELECT p.invited_by INTO ref_id
  FROM public.properties pr
  JOIN public.profiles p ON p.id = pr.seller_id
  WHERE pr.id = esc.property_id
  LIMIT 1;

  INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
  SELECT p_escrow_id, id, 'platform', esc.platform_amount,
    'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-PLT'
  FROM public.profiles
  WHERE role = 'superadmin' ORDER BY id
  LIMIT 1;

  IF esc.agent_id IS NOT NULL AND esc.agent_payout > 0 THEN
    INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
    VALUES (p_escrow_id, esc.agent_id, 'agent', esc.agent_payout,
      'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-AGT');
  END IF;

  IF ref_id IS NOT NULL AND esc.referral_payout > 0 THEN
    INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
    VALUES (p_escrow_id, ref_id,
      CASE esc.transaction_type WHEN 'hotel' THEN 'referrer' ELSE 'referrer' END,
      esc.referral_payout,
      'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-REF');
  END IF;

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

CREATE OR REPLACE FUNCTION public.fn_auto_release_expired_escrows()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  released integer := 0;
  esc_row  public.escrow_transactions%ROWTYPE;
BEGIN
  FOR esc_row IN
    SELECT * FROM public.escrow_transactions
    WHERE status = 'funded'
      AND transaction_type = 'rental'
      AND auto_release_at IS NOT NULL
      AND auto_release_at <= now()
      AND dispute_filed_at IS NULL
      AND confirmed_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Fix 2: setting status to 'released' fires trg_post_release_split, which runs the
    -- split once. Do not call fn_calculate_revenue_split here as well.
    UPDATE public.escrow_transactions
    SET status = 'released', released_at = now()
    WHERE id = esc_row.id;

    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES ('escrow_auto_released_72h',
      jsonb_build_object('escrow_id', esc_row.id, 'property_id', esc_row.property_id),
      NULL);

    released := released + 1;
  END LOOP;
  RETURN released;
END;
$function$;
