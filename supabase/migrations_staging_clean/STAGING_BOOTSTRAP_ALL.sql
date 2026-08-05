-- ============================================================================
-- DealMatch Staging Bootstrap: complete application schema, in order
-- Combines the cleaned production baseline (public-schema objects only,
-- Supabase-internal system schema and psql meta-commands stripped) with
-- every subsequent migration this project has authored, concatenated in
-- filename order. Safe to paste and run as one query in the SQL Editor
-- against a fresh Supabase project.
-- ============================================================================


-- ============================================================
-- SOURCE: 00_baseline_public_schema_only.sql
-- ============================================================

-- ============================================================================
-- STAGING-SAFE APPLICATION SCHEMA
-- Extracted from 20260711000000_production_baseline_schema.sql, which is a
-- raw `pg_dump` of the entire production database (including Supabase's
-- own internal auth/storage/realtime/extensions system schemas, and psql
-- meta-commands like \restrict/\unrestrict that only work in the psql CLI,
-- not the SQL Editor). This file keeps ONLY the objects whose dump header
-- said "Schema: public" -- i.e. DealMatch's actual application tables,
-- indexes, constraints, functions, triggers, and RLS policies. Everything
-- Supabase-internal is dropped, since a fresh Supabase project already has
-- all of that provisioned automatically; recreating it would either
-- conflict or fail on permissions.
-- ============================================================================

-- Name: calculate_lead_score(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_lead_score(p_intent text, p_timeline text, p_budget text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN (
    CASE p_intent
      WHEN 'urgent_buyer'     THEN 40
      WHEN 'make_offer'       THEN 35
      WHEN 'schedule_viewing' THEN 25
      WHEN 'interested'       THEN 15
      ELSE 5
    END
    +
    CASE p_timeline
      WHEN 'immediate' THEN 30
      WHEN '1_month'   THEN 20
      WHEN '3_months'  THEN 10
      WHEN '6_months'  THEN 5
      ELSE 0
    END
    +
    CASE WHEN p_budget IS NOT NULL AND p_budget <> '' THEN 10 ELSE 0 END
  );
END;$$;


--
-- Name: check_booking_availability(uuid, date, date, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_booking_availability(p_property_id uuid, p_checkin date, p_checkout date, p_rooms integer DEFAULT 1, p_category_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_available int;
  v_booked    int;
BEGIN
  IF p_category_id IS NOT NULL THEN
    SELECT available_rooms INTO v_available
      FROM public.room_categories WHERE id = p_category_id AND is_active = true;
  ELSE
    SELECT COALESCE(SUM(available_rooms), 0) INTO v_available
      FROM public.room_categories WHERE property_id = p_property_id AND is_active = true;
  END IF;
  IF v_available IS NULL THEN v_available := 0; END IF;
  SELECT COALESCE(SUM(rooms_booked), 0) INTO v_booked
    FROM public.bookings
   WHERE property_id = p_property_id
     AND status NOT IN ('cancelled','no_show')
     AND checkin_date < p_checkout
     AND checkout_date > p_checkin
     AND (p_category_id IS NULL OR category_id = p_category_id);
  RETURN (v_available - v_booked) >= p_rooms;
END;$$;


--
-- Name: check_device_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_device_exists(p_fingerprint text) RETURNS TABLE(exists_count integer, existing_email text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::int, MIN(p.email)
  FROM public.profiles p
  WHERE p.device_fingerprint = p_fingerprint
    AND p_fingerprint IS NOT NULL
    AND p_fingerprint != '';
$$;


--
-- Name: check_email_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_email_exists(p_email text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;


--
-- Name: check_phone_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_phone_exists(p_phone text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = p_phone
  );
$$;


--
-- Name: check_signup_conflicts(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_signup_conflicts(p_email text, p_phone text DEFAULT NULL::text, p_username text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_email_taken    boolean := false;
  v_phone_taken    boolean := false;
  v_username_taken boolean := false;
BEGIN
  -- Check email in auth.users (catches ALL signup methods)
  SELECT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE LOWER(email) = LOWER(p_email) AND deleted_at IS NULL
  ) INTO v_email_taken;

  -- Check phone in profiles
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE phone = p_phone AND phone IS NOT NULL AND phone <> ''
    ) INTO v_phone_taken;
  END IF;

  -- Check username in profiles
  IF p_username IS NOT NULL AND p_username <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE LOWER(username) = LOWER(p_username) AND username IS NOT NULL
    ) INTO v_username_taken;
  END IF;

  RETURN json_build_object(
    'email_taken',    v_email_taken,
    'phone_taken',    v_phone_taken,
    'username_taken', v_username_taken,
    'any_conflict',   v_email_taken OR v_phone_taken OR v_username_taken
  );
END;
$$;


--
-- Name: check_username_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_username_exists(p_username text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(p_username)
  );
$$;


--
-- Name: confirm_referral_earning(uuid, text, text, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_referral_earning(p_referee_id uuid, p_payment_id text, p_transaction_type text, p_deal_amount numeric, p_platform_fee numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_referrer_id      uuid;
  v_referral_rate    numeric := 0.10;
  v_referral_earning numeric;
BEGIN
  SELECT invited_by INTO v_referrer_id
  FROM public.profiles WHERE id = p_referee_id;

  IF v_referrer_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.referral_transactions WHERE payment_id = p_payment_id
  ) THEN RETURN; END IF;

  v_referral_earning := ROUND(p_platform_fee * v_referral_rate, 2);

  INSERT INTO public.referral_transactions (
    referrer_id, referee_id, payment_id, transaction_type,
    deal_amount, referral_rate, platform_fee, referral_earning, status, confirmed_at
  ) VALUES (
    v_referrer_id, p_referee_id, p_payment_id, p_transaction_type,
    p_deal_amount, v_referral_rate, p_platform_fee, v_referral_earning, 'confirmed', NOW()
  );

  UPDATE public.profiles
  SET referral_earnings = COALESCE(referral_earnings, 0) + v_referral_earning
  WHERE id = v_referrer_id;
END;
$$;


--
-- Name: fn_audit_admin_action(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit_admin_action() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES (
    TG_ARGV[0],
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'record_id', NEW.id,
      'new_status', CASE TG_TABLE_NAME
        WHEN 'properties' THEN NEW.status
        WHEN 'profiles'   THEN NEW.identity_verification_status
        ELSE NULL
      END
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$;


--
-- Name: fn_auto_release_expired_escrows(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auto_release_expired_escrows() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
    UPDATE public.escrow_transactions
    SET status = 'released', released_at = now()
    WHERE id = esc_row.id;

    -- Write audit entry
    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES ('escrow_auto_released_72h',
      jsonb_build_object('escrow_id', esc_row.id, 'property_id', esc_row.property_id),
      NULL);

    -- Trigger payout split
    PERFORM public.fn_calculate_revenue_split(esc_row.id);

    released := released + 1;
  END LOOP;
  RETURN released;
END;
$$;


--
-- Name: fn_calculate_revenue_split(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calculate_revenue_split(p_escrow_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  esc         public.escrow_transactions%ROWTYPE;
  plat_amt    numeric;
  agent_amt   numeric;
  ref_amt     numeric;
  owner_amt   numeric;
  ref_id      uuid;
BEGIN
  -- Lock the row to prevent concurrent execution
  SELECT * INTO esc
  FROM public.escrow_transactions
  WHERE id = p_escrow_id
  FOR UPDATE;

  -- Guard: only process once
  IF esc.payout_locked THEN
    RAISE EXCEPTION 'Payout already processed for escrow %', p_escrow_id;
  END IF;

  -- Mark as locked immediately
  UPDATE public.escrow_transactions
  SET payout_locked = true
  WHERE id = p_escrow_id;

  -- ── RENTAL: 7.5% total (3.75% each side) ──────────────────
  IF esc.transaction_type = 'rental' THEN
    -- Total fee pool = gross * 0.075
    -- Split: 65% platform, 25% agent, 10% referrer
    plat_amt  := ROUND(esc.gross_amount * 0.075 * 0.65, 2);
    agent_amt := ROUND(esc.gross_amount * 0.075 * 0.25, 2);
    ref_amt   := ROUND(esc.gross_amount * 0.075 * 0.10, 2);
    owner_amt := esc.gross_amount - ROUND(esc.gross_amount * 0.0375, 2); -- landlord net

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.075,
      platform_amount   = plat_amt,
      agent_pct         = 0.25,
      agent_payout      = agent_amt,
      referral_pct      = 0.10,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt,
      fee_from_tenant   = ROUND(esc.gross_amount * 0.0375, 2),
      fee_from_landlord = ROUND(esc.gross_amount * 0.0375, 2)
    WHERE id = p_escrow_id;

  -- ── SALE: 3.0% total (1.5% each side) ──────────────────────
  ELSIF esc.transaction_type = 'sale' THEN
    plat_amt  := ROUND(esc.gross_amount * 0.030 * 0.60, 2);
    agent_amt := ROUND(esc.gross_amount * 0.030 * 0.30, 2);
    ref_amt   := ROUND(esc.gross_amount * 0.030 * 0.10, 2);
    owner_amt := esc.gross_amount - ROUND(esc.gross_amount * 0.015, 2); -- seller net

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.030,
      platform_amount   = plat_amt,
      agent_pct         = 0.30,
      agent_payout      = agent_amt,
      referral_pct      = 0.10,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt,
      fee_from_tenant   = ROUND(esc.gross_amount * 0.015, 2),
      fee_from_landlord = ROUND(esc.gross_amount * 0.015, 2)
    WHERE id = p_escrow_id;

  -- ── HOTEL: 12% commission built into price ──────────────────
  ELSIF esc.transaction_type = 'hotel' THEN
    plat_amt  := ROUND(esc.gross_amount * 0.10, 2);  -- 10% platform
    ref_amt   := ROUND(esc.gross_amount * 0.02, 2);  -- 2% referrer
    owner_amt := esc.gross_amount - plat_amt - ref_amt; -- 88% hotel owner

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

  -- Re-fetch updated row
  SELECT * INTO esc FROM public.escrow_transactions WHERE id = p_escrow_id;

  -- Get referrer id from property's seller referral tracking
  SELECT p.referred_by INTO ref_id
  FROM public.properties pr
  JOIN public.profiles p ON p.id = pr.seller_id
  WHERE pr.id = esc.property_id
  LIMIT 1;

  -- Write immutable ledger entries
  -- Platform
  INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
  SELECT p_escrow_id, id, 'platform', esc.platform_amount,
    'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-PLT'
  FROM public.profiles
  WHERE email IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
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

  -- Mark split complete
  UPDATE public.escrow_transactions
  SET payout_processed_at = now()
  WHERE id = p_escrow_id;

END;
$$;


--
-- Name: fn_check_deed_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_deed_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  buyer_deed  public.deed_submissions%ROWTYPE;
  seller_deed public.deed_submissions%ROWTYPE;
BEGIN
  SELECT * INTO buyer_deed  FROM public.deed_submissions
  WHERE escrow_id = NEW.escrow_id AND party_role = 'buyer'  LIMIT 1;
  SELECT * INTO seller_deed FROM public.deed_submissions
  WHERE escrow_id = NEW.escrow_id AND party_role = 'seller' LIMIT 1;

  -- Both submitted — attempt auto-verify (basic metadata match)
  IF buyer_deed.id IS NOT NULL AND seller_deed.id IS NOT NULL THEN
    -- In production: call OCR edge function here
    -- For now: mark deed_verified_at and release if both have legal stamp
    IF buyer_deed.has_legal_stamp AND seller_deed.has_legal_stamp THEN
      UPDATE public.escrow_transactions
      SET deed_verified_at = now(),
          deed_buyer_url   = buyer_deed.document_path,
          deed_seller_url  = seller_deed.document_path,
          status           = 'released',
          released_at      = now()
      WHERE id = NEW.escrow_id AND status = 'funded';

      INSERT INTO public.admin_audit_log (action, metadata)
      VALUES ('deed_auto_verified',
        jsonb_build_object('escrow_id', NEW.escrow_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_generate_checkin_token(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_checkin_token(p_escrow_id uuid, p_guest_id uuid, p_property_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  token text;
BEGIN
  -- Generate 6-digit numeric token
  token := lpad(floor(random() * 1000000)::text, 6, '0');

  INSERT INTO public.checkin_tokens
    (escrow_id, property_id, guest_id, token, expires_at)
  VALUES
    (p_escrow_id, p_property_id, p_guest_id, token, now() + interval '24 hours');

  -- Store on escrow record too
  UPDATE public.escrow_transactions
  SET checkin_token = token
  WHERE id = p_escrow_id;

  RETURN token;
END;
$$;


--
-- Name: fn_init_agent_score(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_init_agent_score() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.role = 'agent' THEN
    INSERT INTO public.agent_scores (agent_id)
    VALUES (NEW.id)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_populate_complaint_agent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_populate_complaint_agent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Set 48-hour response deadline
  NEW.response_deadline := NEW.created_at + interval '48 hours';

  -- Find the agent who verified this property
  IF NEW.agent_id IS NULL AND NEW.property_id IS NOT NULL THEN
    SELECT agent_id INTO NEW.agent_id
    FROM public.agent_verifications
    WHERE property_id = NEW.property_id
      AND verdict = 'verified'
    ORDER BY submitted_at DESC
    LIMIT 1;

    -- Also link verification record
    IF NEW.verification_id IS NULL AND NEW.agent_id IS NOT NULL THEN
      SELECT id INTO NEW.verification_id
      FROM public.agent_verifications
      WHERE property_id = NEW.property_id
        AND agent_id = NEW.agent_id
        AND verdict = 'verified'
      ORDER BY submitted_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- Increment complaints_received on agent score
  IF NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.agent_scores (agent_id, complaints_received)
    VALUES (NEW.agent_id, 1)
    ON CONFLICT (agent_id) DO UPDATE
      SET complaints_received = agent_scores.complaints_received + 1,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_post_release_split(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_release_split() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status = 'released' AND OLD.status <> 'released'
     AND NOT NEW.payout_locked THEN
    PERFORM public.fn_calculate_revenue_split(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_process_complaint_resolution(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_process_complaint_resolution() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  new_strikes integer;
BEGIN
  -- Only act when status changes TO 'upheld'
  IF NEW.status = 'upheld' AND OLD.status <> 'upheld' AND NEW.agent_id IS NOT NULL THEN

    UPDATE public.agent_scores
    SET
      complaints_upheld = complaints_upheld + 1,
      strike_count      = strike_count + 1,
      rating            = GREATEST(1.00, rating - 0.50),
      updated_at        = now()
    WHERE agent_id = NEW.agent_id
    RETURNING strike_count INTO new_strikes;

    -- 3 strikes → auto-suspend
    IF new_strikes >= 3 THEN
      UPDATE public.agent_scores
      SET status = 'suspended', updated_at = now()
      WHERE agent_id = NEW.agent_id;

      UPDATE public.profiles
      SET role = 'suspended'
      WHERE id = NEW.agent_id;

      INSERT INTO public.admin_audit_log (action, metadata, performed_by)
      VALUES (
        'agent_auto_suspended',
        jsonb_build_object(
          'agent_id', NEW.agent_id,
          'strike_count', new_strikes,
          'triggered_by_complaint', NEW.id
        ),
        NEW.resolved_by
      );
    END IF;

    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES (
      'agent_strike_issued',
      jsonb_build_object(
        'agent_id', NEW.agent_id,
        'complaint_id', NEW.id,
        'strike_number', new_strikes,
        'complaint_category', NEW.category
      ),
      NEW.resolved_by
    );

  END IF;

  IF NEW.status = 'dismissed' AND OLD.status <> 'dismissed' AND NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES (
      'complaint_dismissed',
      jsonb_build_object('complaint_id', NEW.id, 'agent_id', NEW.agent_id),
      NEW.resolved_by
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_release_on_move_in_confirm(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_release_on_move_in_confirm() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL
     AND NEW.transaction_type = 'rental' AND NEW.status = 'funded'
     AND NEW.dispute_filed_at IS NULL THEN
    NEW.status      := 'released';
    NEW.released_at := now();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_sanitize_property_inputs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sanitize_property_inputs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.title       := public.fn_sanitize_text(COALESCE(NEW.title, ''));
  NEW.description := public.fn_sanitize_text(COALESCE(NEW.description, ''));
  NEW.address     := public.fn_sanitize_text(COALESCE(NEW.address, ''));
  RETURN NEW;
END;
$$;


--
-- Name: fn_sanitize_testimonial_inputs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sanitize_testimonial_inputs() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.name       := public.fn_sanitize_text(COALESCE(NEW.name, ''));
  NEW.role_label := public.fn_sanitize_text(COALESCE(NEW.role_label, ''));
  NEW.content    := public.fn_sanitize_text(COALESCE(NEW.content, ''));
  -- Hard length caps regardless of what the client sends
  NEW.name       := left(NEW.name, 80);
  NEW.role_label := left(NEW.role_label, 80);
  NEW.content    := left(NEW.content, 600);
  RETURN NEW;
END;
$$;


--
-- Name: fn_sanitize_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sanitize_text(input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
BEGIN
  -- Remove script tags, SQL comment sequences, null bytes
  input := regexp_replace(input, '<[^>]+>', '', 'g');
  input := regexp_replace(input, '--', '', 'g');
  input := regexp_replace(input, chr(0), '', 'g');
  input := regexp_replace(input, '(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC)\s', '', 'gi');
  RETURN trim(input);
END;
$$;


--
-- Name: fn_set_auto_release(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_auto_release() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.move_in_date IS NOT NULL AND NEW.status = 'funded'
     AND NEW.transaction_type = 'rental' THEN
    NEW.auto_release_at := (NEW.move_in_date::timestamptz + interval '72 hours');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_update_agent_score_on_verification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_agent_score_on_verification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.agent_scores (agent_id, total_verifications, verified_count, rejected_count, last_activity)
  VALUES (
    NEW.agent_id, 1,
    CASE WHEN NEW.verdict = 'verified' THEN 1 ELSE 0 END,
    CASE WHEN NEW.verdict = 'rejected' THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    total_verifications = agent_scores.total_verifications + 1,
    verified_count      = agent_scores.verified_count + CASE WHEN NEW.verdict = 'verified' THEN 1 ELSE 0 END,
    rejected_count      = agent_scores.rejected_count + CASE WHEN NEW.verdict = 'rejected' THEN 1 ELSE 0 END,
    last_activity       = now(),
    updated_at          = now();
  RETURN NEW;
END;
$$;


--
-- Name: fn_validate_checkin_token(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_checkin_token(p_token text, p_validator uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  tok public.checkin_tokens%ROWTYPE;
BEGIN
  SELECT * INTO tok FROM public.checkin_tokens
  WHERE token = p_token AND expires_at > now() AND validated_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Invalid or expired token');
  END IF;

  -- Mark validated
  UPDATE public.checkin_tokens
  SET validated_at = now(), validated_by = p_validator
  WHERE id = tok.id;

  UPDATE public.escrow_transactions
  SET token_validated_at = now()
  WHERE id = tok.escrow_id;

  -- Schedule release for next morning 06:00
  UPDATE public.escrow_transactions
  SET auto_release_at = date_trunc('day', now() + interval '1 day') + interval '6 hours'
  WHERE id = tok.escrow_id AND status = 'funded';

  RETURN jsonb_build_object(
    'success', true,
    'escrow_id', tok.escrow_id,
    'release_at', date_trunc('day', now() + interval '1 day') + interval '6 hours'
  );
END;
$$;


--
-- Name: generate_mortgage_ticket_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_mortgage_ticket_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.ticket_id := 'MTG-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  RETURN NEW;
END;
$$;


--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (
        new.id,
            new.raw_user_meta_data->>'full_name',
                new.email,
                    COALESCE(new.raw_user_meta_data->>'role', 'buyer')
                      )
                        ON CONFLICT (id) DO NOTHING;
                          RETURN new;
                          END;
                          $$;


--
-- Name: handle_new_user_earnings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_earnings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.user_earnings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR email = 'divineandbassey@gmail.com')
  )
$$;


--
-- Name: is_admin_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin','agent','verifier')
  ) OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
  )
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin','agent')
  ) OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email = 'divineandbassey@gmail.com'
  )
$$;


--
-- Name: trigger_initialize_escrow(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_initialize_escrow() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status = 'executed' AND (OLD.status IS DISTINCT FROM 'executed') THEN
    INSERT INTO public.escrow_transactions (
      property_id, amount, platform_fee, status, payment_ref, created_at
    ) VALUES (
      NEW.property_id,
      NEW.amount,
      ROUND(NEW.amount * 0.025, 2),
      'awaiting_payment',
      'ESC-' || upper(substring(NEW.id::text, 1, 8)),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: admin_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    type text DEFAULT 'info'::text,
    target text DEFAULT 'all'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admin_announcements_type_check CHECK ((type = ANY (ARRAY['info'::text, 'warning'::text, 'success'::text, 'critical'::text])))
);


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    meta text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    badge_number text,
    assigned_states text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    agent_id uuid,
    assigned_by uuid,
    status text DEFAULT 'assigned'::text,
    visit_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_assignments_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: agent_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    property_id uuid,
    payment_type text,
    amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text,
    paid_at timestamp with time zone,
    CONSTRAINT agent_payments_payment_type_check CHECK ((payment_type = ANY (ARRAY['field_verification'::text, 'senior_override'::text]))),
    CONSTRAINT agent_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: agent_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_scores (
    agent_id uuid NOT NULL,
    total_verifications integer DEFAULT 0 NOT NULL,
    verified_count integer DEFAULT 0 NOT NULL,
    rejected_count integer DEFAULT 0 NOT NULL,
    complaints_received integer DEFAULT 0 NOT NULL,
    complaints_upheld integer DEFAULT 0 NOT NULL,
    strike_count integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT 5.00,
    status text DEFAULT 'active'::text NOT NULL,
    last_activity timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_scores_status_check CHECK ((status = ANY (ARRAY['active'::text, 'under_review'::text, 'suspended'::text, 'banned'::text])))
);


--
-- Name: agent_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    photos text[] DEFAULT '{}'::text[] NOT NULL,
    gps_lat numeric(10,7),
    gps_lng numeric(10,7),
    gps_accuracy_m integer,
    visited_at timestamp with time zone DEFAULT now() NOT NULL,
    checklist jsonb DEFAULT '{"water_running": false, "landlord_present": false, "address_confirmed": false, "electricity_working": false, "matches_description": false, "no_structural_damage": false}'::jsonb NOT NULL,
    verdict text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    liability_acknowledged boolean DEFAULT false NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    CONSTRAINT agent_verifications_verdict_check CHECK ((verdict = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: bank_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_name text NOT NULL,
    account_name text NOT NULL,
    account_number text NOT NULL,
    account_type text DEFAULT 'business'::text,
    currency text DEFAULT 'NGN'::text,
    is_active boolean DEFAULT true,
    is_primary boolean DEFAULT false,
    notes text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_details_account_type_check CHECK ((account_type = ANY (ARRAY['business'::text, 'domiciliary'::text]))),
    CONSTRAINT bank_details_currency_check CHECK ((currency = ANY (ARRAY['NGN'::text, 'USD'::text])))
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    category_id uuid,
    guest_name text NOT NULL,
    guest_phone text NOT NULL,
    guest_email text,
    checkin_date date NOT NULL,
    checkout_date date NOT NULL,
    rooms_booked integer DEFAULT 1 NOT NULL,
    total_amount numeric,
    payment_ref text,
    source text DEFAULT 'dealmatch'::text,
    status text DEFAULT 'confirmed'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    checkin_at timestamp with time zone,
    checkout_at timestamp with time zone,
    admin_note text,
    guests integer DEFAULT 1,
    room_type text,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text])))
);


--
-- Name: checkin_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkin_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    escrow_id uuid NOT NULL,
    property_id uuid,
    guest_id uuid,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    validated_at timestamp with time zone,
    validated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: complaints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    verification_id uuid,
    agent_id uuid,
    complainant_id uuid NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    evidence_urls text[] DEFAULT '{}'::text[],
    status text DEFAULT 'open'::text NOT NULL,
    resolution_note text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    agent_response text,
    agent_responded_at timestamp with time zone,
    response_deadline timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT complaints_category_check CHECK ((category = ANY (ARRAY['fake_listing'::text, 'misrepresentation'::text, 'wrong_address'::text, 'structural_damage'::text, 'fraud'::text, 'agent_misconduct'::text, 'other'::text]))),
    CONSTRAINT complaints_status_check CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'upheld'::text, 'dismissed'::text, 'escalated'::text])))
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    buyer_id uuid,
    seller_id uuid,
    amount numeric(15,2),
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT contracts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'signed'::text, 'executed'::text, 'cancelled'::text])))
);


--
-- Name: crypto_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_name text,
    user_phone text,
    user_email text,
    reference text NOT NULL,
    description text NOT NULL,
    usdt_amount numeric NOT NULL,
    network text NOT NULL,
    wallet_addr text,
    tx_hash text,
    status text DEFAULT 'pending'::text,
    metadata jsonb,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crypto_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text])))
);


--
-- Name: crypto_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_wallets (
    id text NOT NULL,
    coin text NOT NULL,
    network text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    icon text DEFAULT '💰'::text,
    color text DEFAULT '#888888'::text,
    fee_label text DEFAULT ''::text,
    fee_fixed numeric DEFAULT 0,
    confirm_label text DEFAULT ''::text,
    recommended boolean DEFAULT false,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: deal_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    buyer_id uuid,
    buyer_name text NOT NULL,
    buyer_email text,
    buyer_phone text,
    buyer_signature text NOT NULL,
    agreement_text text NOT NULL,
    category text DEFAULT 'sale'::text,
    status text DEFAULT 'buyer_signed'::text,
    lister_signed_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT deal_agreements_status_check CHECK ((status = ANY (ARRAY['buyer_signed'::text, 'lister_signed'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: deed_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deed_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    escrow_id uuid NOT NULL,
    property_id uuid,
    submitted_by uuid NOT NULL,
    party_role text NOT NULL,
    document_path text NOT NULL,
    extracted_name text,
    extracted_plot text,
    has_legal_stamp boolean DEFAULT false,
    verified boolean DEFAULT false,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deed_submissions_party_role_check CHECK ((party_role = ANY (ARRAY['buyer'::text, 'seller'::text])))
);


--
-- Name: disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    reporter_id uuid,
    against_id uuid,
    booking_id uuid,
    reason text NOT NULL,
    description text,
    evidence_urls text[] DEFAULT '{}'::text[],
    status text DEFAULT 'open'::text,
    resolution text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT disputes_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text, 'dismissed'::text])))
);


--
-- Name: escrow_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    tenant_id uuid,
    status text DEFAULT 'pending'::text,
    transaction_type text DEFAULT 'rental'::text,
    buyer_id uuid,
    seller_id uuid,
    agent_id uuid,
    referrer_id uuid,
    gross_amount numeric,
    platform_pct numeric,
    platform_amount numeric,
    agent_pct numeric,
    agent_payout numeric,
    referral_pct numeric,
    referral_payout numeric,
    landlord_receives numeric,
    fee_from_tenant numeric,
    fee_from_landlord numeric,
    move_in_date date,
    confirmed_at timestamp with time zone,
    auto_release_at timestamp with time zone,
    dispute_filed_at timestamp with time zone,
    checkin_token text,
    token_validated_at timestamp with time zone,
    deed_buyer_url text,
    deed_seller_url text,
    deed_verified_at timestamp with time zone,
    idempotency_key text,
    payout_processed_at timestamp with time zone,
    payout_locked boolean DEFAULT false,
    CONSTRAINT escrow_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['rental'::text, 'sale'::text, 'hotel'::text])))
);


--
-- Name: hostel_enquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_enquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hostel_id uuid,
    student_id uuid,
    student_name text,
    student_phone text,
    student_email text,
    matric_number text,
    message text,
    move_in_date date,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hostel_enquiries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'converted'::text, 'closed'::text])))
);


--
-- Name: hostel_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hostel_id uuid,
    owner_id uuid,
    reference text NOT NULL,
    amount numeric NOT NULL,
    plan text NOT NULL,
    status text DEFAULT 'pending'::text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hostel_payments_plan_check CHECK ((plan = ANY (ARRAY['semester'::text, 'annual'::text]))),
    CONSTRAINT hostel_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text])))
);


--
-- Name: institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    short_name text,
    state text NOT NULL,
    city text NOT NULL,
    type text DEFAULT 'university'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT institutions_type_check CHECK ((type = ANY (ARRAY['university'::text, 'polytechnic'::text, 'college'::text])))
);


--
-- Name: loyalty_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    points_balance integer DEFAULT 0,
    points_lifetime integer DEFAULT 0,
    points_redeemed integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    property_id uuid,
    match_score integer,
    match_reasons text[] DEFAULT '{}'::text[],
    is_shortlisted boolean DEFAULT false,
    contacted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    sender_id uuid,
    sender_name text,
    recipient_id uuid,
    property_id uuid,
    content text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mortgage_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mortgage_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    full_name text NOT NULL,
    phone text NOT NULL,
    email text,
    monthly_income numeric,
    employment_type text DEFAULT 'employed'::text,
    property_value numeric,
    down_payment numeric,
    loan_term_years integer DEFAULT 15,
    property_type text,
    property_state text,
    lender_id text,
    status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    ticket_id text,
    CONSTRAINT mortgage_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'reviewing'::text, 'approved'::text, 'declined'::text, 'finished'::text, 'on_hold'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    amount numeric,
    link text,
    read boolean DEFAULT false,
    email_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    reference text NOT NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'NGN'::text,
    professional_type text,
    plan_type text,
    email text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid
);


--
-- Name: pinecone_index_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pinecone_index_status (
    property_id uuid NOT NULL,
    is_indexed boolean DEFAULT false,
    last_indexed timestamp with time zone DEFAULT now(),
    error_log text
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text,
    label text,
    category text DEFAULT 'general'::text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: pro_activation_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pro_activation_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    city text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    notes text
);


--
-- Name: professional_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_applications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    professional_type text,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    company_name text,
    license_number text,
    coverage_areas text,
    plan_type text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    subscription_plan text DEFAULT 'basic'::text,
    subscription_start timestamp with time zone,
    subscription_expiry timestamp with time zone,
    referred_amount numeric DEFAULT 0,
    activated_at timestamp with time zone,
    rating numeric DEFAULT 0,
    review_count integer DEFAULT 0,
    is_verified boolean DEFAULT false,
    avatar_url text,
    CONSTRAINT professional_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: professional_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    professional_id text NOT NULL,
    professional_type text NOT NULL,
    professional_name text NOT NULL,
    client_name text NOT NULL,
    client_phone text NOT NULL,
    client_email text,
    details text,
    urgency text DEFAULT 'normal'::text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT professional_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'connected'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT professional_requests_urgency_check CHECK ((urgency = ANY (ARRAY['normal'::text, 'soon'::text, 'urgent'::text])))
);


--
-- Name: professional_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    professional_id text NOT NULL,
    reviewer_id uuid,
    reviewer_name text NOT NULL,
    rating numeric(2,1) NOT NULL,
    review_text text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT professional_reviews_rating_check CHECK (((rating >= (1)::numeric) AND (rating <= (5)::numeric)))
);


--
-- Name: professionals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professionals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    professional_type text,
    full_name text NOT NULL,
    company_name text,
    email text NOT NULL,
    phone text,
    license_number text,
    coverage_areas text,
    bio text,
    is_verified boolean DEFAULT false,
    is_active boolean DEFAULT false,
    subscription_plan text,
    subscription_started_at timestamp with time zone,
    subscription_expires_at timestamp with time zone,
    referral_count integer DEFAULT 0,
    rating numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT professionals_professional_type_check CHECK ((professional_type = ANY (ARRAY['surveyor'::text, 'inspector'::text, 'lender'::text]))),
    CONSTRAINT professionals_subscription_plan_check CHECK ((subscription_plan = ANY (ARRAY['monthly'::text, 'annual'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    email text,
    phone text,
    avatar_url text,
    location text,
    bio text,
    role text DEFAULT 'buyer'::text,
    buyer_preferences jsonb DEFAULT '{}'::jsonb,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    state text,
    city text,
    is_photo_verified boolean DEFAULT false,
    is_live_verified boolean DEFAULT false,
    live_verified_at timestamp with time zone,
    budget_max numeric,
    budget_min numeric,
    property_goal text,
    preferred_states text[] DEFAULT '{}'::text[],
    property_types text[] DEFAULT '{}'::text[],
    needs_financing boolean DEFAULT false,
    id_doc_url text,
    id_doc_type text,
    id_verified boolean DEFAULT false,
    id_verified_at timestamp with time zone,
    face_video_url text,
    bank_name text,
    account_number text,
    account_name text,
    routing_number text,
    identity_photo_url text,
    identity_selfie_url text,
    identity_doc_type text,
    identity_verification_status text DEFAULT 'unverified'::text,
    identity_verified_at timestamp with time zone,
    identity_rejection_note text,
    identity_verified_by uuid,
    username text,
    is_deactivated boolean DEFAULT false,
    verification_skipped boolean DEFAULT false,
    invite_code text,
    invited_by uuid,
    referral_earnings numeric DEFAULT 0,
    referral_paid_out numeric DEFAULT 0,
    is_student_verified boolean DEFAULT false,
    student_institution text,
    referral_level integer DEFAULT 0,
    device_fingerprint text,
    account_flagged boolean DEFAULT false,
    flagged_reason text,
    account_status text DEFAULT 'active'::text,
    CONSTRAINT profiles_identity_verification_status_check CHECK ((identity_verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['buyer'::text, 'seller'::text, 'renter'::text, 'landlord'::text, 'agent'::text, 'investor'::text, 'student'::text, 'verifier'::text, 'admin'::text, 'superadmin'::text, 'suspended'::text, 'deleted'::text])))
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    seller_id uuid,
    title text NOT NULL,
    description text,
    property_type text,
    listing_type text DEFAULT 'For Sale'::text,
    price bigint NOT NULL,
    state text NOT NULL,
    city text NOT NULL,
    address text,
    bedrooms integer,
    bathrooms integer,
    size_sqm numeric,
    features text[] DEFAULT '{}'::text[],
    documents text[] DEFAULT '{}'::text[],
    status text DEFAULT 'active'::text,
    view_count integer DEFAULT 0,
    like_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    category text DEFAULT 'sale'::text,
    price_period text DEFAULT 'month'::text,
    contact_phone text,
    contact_email text,
    max_guests integer,
    video_url text,
    landlord_name text,
    rules text,
    rating numeric DEFAULT 0,
    review_count integer DEFAULT 0,
    custom_terms text,
    verified_by uuid,
    verified_at timestamp with time zone,
    verification_note text,
    latitude numeric,
    longitude numeric,
    payment_ref text,
    assigned_agent_id uuid,
    occupancy_status text DEFAULT 'vacant'::text,
    assigned_at timestamp with time zone,
    verification_date timestamp with time zone,
    verification_notes text,
    CONSTRAINT properties_occupancy_status_check CHECK ((occupancy_status = ANY (ARRAY['vacant'::text, 'occupied'::text]))),
    CONSTRAINT properties_property_type_check CHECK ((property_type = ANY (ARRAY['land'::text, 'apartment'::text, 'duplex'::text, 'detached'::text, 'terrace'::text, 'commercial'::text]))),
    CONSTRAINT properties_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'sold'::text, 'removed'::text])))
);


--
-- Name: property_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_images (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    property_id uuid,
    url text NOT NULL,
    is_primary boolean DEFAULT false,
    caption text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: property_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    landlord_id uuid NOT NULL,
    assigned_agent uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    proposed_date timestamp with time zone,
    confirmed_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT property_inspections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: property_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_interest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    property_id uuid,
    intent text DEFAULT 'interested'::text,
    budget_range text,
    timeline text,
    message text,
    phone text,
    status text DEFAULT 'new'::text,
    lead_score integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    referred_by uuid,
    CONSTRAINT property_interest_intent_check CHECK ((intent = ANY (ARRAY['interested'::text, 'schedule_viewing'::text, 'make_offer'::text, 'request_info'::text, 'urgent_buyer'::text]))),
    CONSTRAINT property_interest_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'closed'::text, 'junk'::text]))),
    CONSTRAINT property_interest_timeline_check CHECK ((timeline = ANY (ARRAY['immediate'::text, '1_month'::text, '3_months'::text, '6_months'::text, 'just_browsing'::text])))
);


--
-- Name: property_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    reviewer_id uuid,
    reviewer_name text NOT NULL,
    landlord_id uuid,
    rating numeric(2,1) NOT NULL,
    review_text text,
    category text DEFAULT 'general'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT property_reviews_rating_check CHECK (((rating >= (1)::numeric) AND (rating <= (5)::numeric)))
);


--
-- Name: referral_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referee_id uuid NOT NULL,
    payment_id text,
    transaction_type text NOT NULL,
    deal_amount numeric NOT NULL,
    referral_rate numeric DEFAULT 0.10 NOT NULL,
    platform_fee numeric NOT NULL,
    referral_earning numeric NOT NULL,
    status text DEFAULT 'pending'::text,
    confirmed_at timestamp with time zone,
    paid_out_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    buyer_id uuid,
    transaction_id uuid,
    dm_commission numeric DEFAULT 0,
    referral_level integer,
    payout_type text,
    points_awarded integer DEFAULT 0,
    points_redeemed integer DEFAULT 0,
    payout_ref text,
    paid_at timestamp with time zone,
    CONSTRAINT referral_transactions_payout_type_check CHECK ((payout_type = ANY (ARRAY['cash'::text, 'points'::text, 'points_redemption'::text]))),
    CONSTRAINT referral_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'paid_out'::text, 'cancelled'::text]))),
    CONSTRAINT referral_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['property_sale'::text, 'rental'::text, 'hotel'::text, 'escrow'::text, 'subscription'::text])))
);


--
-- Name: rental_enquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_enquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    tenant_name text NOT NULL,
    tenant_phone text NOT NULL,
    tenant_email text,
    move_in_date date,
    duration integer DEFAULT 12,
    message text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: room_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    name text NOT NULL,
    total_rooms integer DEFAULT 1 NOT NULL,
    available_rooms integer DEFAULT 1 NOT NULL,
    price_per_night numeric,
    description text,
    amenities text[],
    is_active boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: student_hostels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_hostels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    title text NOT NULL,
    description text,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    latitude numeric,
    longitude numeric,
    institution_id uuid,
    institution_name text,
    distance_km numeric,
    distance_label text,
    room_type text NOT NULL,
    gender_policy text DEFAULT 'mixed'::text,
    rooms_available integer DEFAULT 1,
    total_rooms integer DEFAULT 1,
    price_per_year numeric NOT NULL,
    caution_fee numeric DEFAULT 0,
    agency_fee numeric DEFAULT 0,
    amenities text[] DEFAULT '{}'::text[],
    images text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending_review'::text,
    listing_paid boolean DEFAULT false,
    listing_paid_at timestamp with time zone,
    payment_ref text,
    verified boolean DEFAULT false,
    verified_by uuid,
    verified_at timestamp with time zone,
    views integer DEFAULT 0,
    enquiry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT student_hostels_gender_policy_check CHECK ((gender_policy = ANY (ARRAY['male_only'::text, 'female_only'::text, 'mixed'::text]))),
    CONSTRAINT student_hostels_room_type_check CHECK ((room_type = ANY (ARRAY['single'::text, 'shared_2'::text, 'shared_4'::text, 'shared_6'::text, 'self_contain'::text, 'mini_flat'::text, '2_bedroom'::text]))),
    CONSTRAINT student_hostels_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'active'::text, 'paused'::text, 'rejected'::text, 'filled'::text])))
);


--
-- Name: student_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    institution_id uuid,
    institution_name text,
    matric_number text,
    jamb_reg_number text,
    application_number text,
    school_email text,
    id_image_url text,
    status text DEFAULT 'pending'::text,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT student_verifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: swipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.swipes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    property_id uuid,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT swipes_action_check CHECK ((action = ANY (ARRAY['like'::text, 'pass'::text, 'super'::text])))
);


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    role_label text,
    content text NOT NULL,
    rating smallint DEFAULT 5 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    CONSTRAINT testimonials_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT testimonials_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: user_earnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_earnings (
    user_id uuid NOT NULL,
    total_earned numeric DEFAULT 0,
    is_ambassador boolean DEFAULT false,
    activated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_agent_scorecard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_agent_scorecard AS
 SELECT p.id,
    p.full_name,
    p.email,
    p.phone,
    s.total_verifications,
    s.verified_count,
    s.rejected_count,
    s.complaints_received,
    s.complaints_upheld,
    s.strike_count,
    s.rating,
    s.status,
    s.last_activity,
    round(
        CASE
            WHEN (s.total_verifications = 0) THEN (100)::numeric
            ELSE (((s.verified_count)::numeric / (s.total_verifications)::numeric) * (100)::numeric)
        END, 1) AS success_rate_pct,
    round(
        CASE
            WHEN (s.complaints_received = 0) THEN (0)::numeric
            ELSE (((s.complaints_upheld)::numeric / (s.complaints_received)::numeric) * (100)::numeric)
        END, 1) AS complaint_uphold_rate_pct,
    GREATEST(0, (3 - s.strike_count)) AS strikes_remaining
   FROM (public.profiles p
     JOIN public.agent_scores s ON ((s.agent_id = p.id)))
  WHERE (p.role = ANY (ARRAY['agent'::text, 'suspended'::text]))
  ORDER BY s.rating DESC, s.total_verifications DESC;


--
-- Name: wallet_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    escrow_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    recipient_role text NOT NULL,
    amount numeric(15,2) NOT NULL,
    currency text DEFAULT 'NGN'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    CONSTRAINT wallet_ledger_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT wallet_ledger_recipient_role_check CHECK ((recipient_role = ANY (ARRAY['platform'::text, 'agent'::text, 'referrer'::text, 'landlord'::text, 'seller'::text, 'hotel_owner'::text, 'refund'::text]))),
    CONSTRAINT wallet_ledger_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'failed'::text])))
);


--
-- Name: admin_announcements admin_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_announcements
    ADD CONSTRAINT admin_announcements_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: agent_accounts agent_accounts_badge_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_badge_number_key UNIQUE (badge_number);


--
-- Name: agent_accounts agent_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_email_key UNIQUE (email);


--
-- Name: agent_accounts agent_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_pkey PRIMARY KEY (id);


--
-- Name: agent_accounts agent_accounts_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_user_id_key UNIQUE (user_id);


--
-- Name: agent_assignments agent_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_pkey PRIMARY KEY (id);


--
-- Name: agent_payments agent_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_pkey PRIMARY KEY (id);


--
-- Name: agent_scores agent_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_scores
    ADD CONSTRAINT agent_scores_pkey PRIMARY KEY (agent_id);


--
-- Name: agent_verifications agent_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_pkey PRIMARY KEY (id);


--
-- Name: agent_verifications agent_verifications_property_id_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_property_id_agent_id_key UNIQUE (property_id, agent_id);


--
-- Name: bank_details bank_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_details
    ADD CONSTRAINT bank_details_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: checkin_tokens checkin_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_pkey PRIMARY KEY (id);


--
-- Name: checkin_tokens checkin_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_token_key UNIQUE (token);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: crypto_payments crypto_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_payments
    ADD CONSTRAINT crypto_payments_pkey PRIMARY KEY (id);


--
-- Name: crypto_payments crypto_payments_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_payments
    ADD CONSTRAINT crypto_payments_reference_key UNIQUE (reference);


--
-- Name: crypto_wallets crypto_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_wallets
    ADD CONSTRAINT crypto_wallets_pkey PRIMARY KEY (id);


--
-- Name: deal_agreements deal_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_pkey PRIMARY KEY (id);


--
-- Name: deed_submissions deed_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_submissions
    ADD CONSTRAINT deed_submissions_pkey PRIMARY KEY (id);


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);


--
-- Name: escrow_transactions escrow_transactions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: escrow_transactions escrow_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_pkey PRIMARY KEY (id);


--
-- Name: hostel_enquiries hostel_enquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_enquiries
    ADD CONSTRAINT hostel_enquiries_pkey PRIMARY KEY (id);


--
-- Name: hostel_payments hostel_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_payments
    ADD CONSTRAINT hostel_payments_pkey PRIMARY KEY (id);


--
-- Name: hostel_payments hostel_payments_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_payments
    ADD CONSTRAINT hostel_payments_reference_key UNIQUE (reference);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: loyalty_points loyalty_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_pkey PRIMARY KEY (id);


--
-- Name: loyalty_points loyalty_points_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_user_id_key UNIQUE (user_id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: matches matches_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user_id_property_id_key UNIQUE (user_id, property_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mortgage_applications mortgage_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mortgage_applications
    ADD CONSTRAINT mortgage_applications_pkey PRIMARY KEY (id);


--
-- Name: mortgage_applications mortgage_applications_ticket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mortgage_applications
    ADD CONSTRAINT mortgage_applications_ticket_id_key UNIQUE (ticket_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_reference_key UNIQUE (reference);


--
-- Name: pinecone_index_status pinecone_index_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinecone_index_status
    ADD CONSTRAINT pinecone_index_status_pkey PRIMARY KEY (property_id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: pro_activation_requests pro_activation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_activation_requests
    ADD CONSTRAINT pro_activation_requests_pkey PRIMARY KEY (id);


--
-- Name: professional_applications professional_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_pkey PRIMARY KEY (id);


--
-- Name: professional_requests professional_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_requests
    ADD CONSTRAINT professional_requests_pkey PRIMARY KEY (id);


--
-- Name: professional_reviews professional_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_reviews
    ADD CONSTRAINT professional_reviews_pkey PRIMARY KEY (id);


--
-- Name: professionals professionals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professionals
    ADD CONSTRAINT professionals_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_invite_code_key UNIQUE (invite_code);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_images property_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT property_images_pkey PRIMARY KEY (id);


--
-- Name: property_inspections property_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_pkey PRIMARY KEY (id);


--
-- Name: property_interest property_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_pkey PRIMARY KEY (id);


--
-- Name: property_interest property_interest_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_user_id_property_id_key UNIQUE (user_id, property_id);


--
-- Name: property_reviews property_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_reviews
    ADD CONSTRAINT property_reviews_pkey PRIMARY KEY (id);


--
-- Name: referral_transactions referral_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_transactions
    ADD CONSTRAINT referral_transactions_pkey PRIMARY KEY (id);


--
-- Name: rental_enquiries rental_enquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_enquiries
    ADD CONSTRAINT rental_enquiries_pkey PRIMARY KEY (id);


--
-- Name: room_categories room_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_categories
    ADD CONSTRAINT room_categories_pkey PRIMARY KEY (id);


--
-- Name: student_hostels student_hostels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hostels
    ADD CONSTRAINT student_hostels_pkey PRIMARY KEY (id);


--
-- Name: student_verifications student_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_pkey PRIMARY KEY (id);


--
-- Name: student_verifications student_verifications_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_user_id_key UNIQUE (user_id);


--
-- Name: swipes swipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_pkey PRIMARY KEY (id);


--
-- Name: swipes swipes_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_user_id_property_id_key UNIQUE (user_id, property_id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: profiles unique_phone; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT unique_phone UNIQUE (phone);


--
-- Name: user_earnings user_earnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_earnings
    ADD CONSTRAINT user_earnings_pkey PRIMARY KEY (user_id);


--
-- Name: wallet_ledger wallet_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);


--
-- Name: wallet_ledger wallet_ledger_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_reference_key UNIQUE (reference);


--
-- Name: idx_agent_payments_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_payments_agent ON public.agent_payments USING btree (agent_id, status);


--
-- Name: idx_agent_verifications_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_verifications_agent ON public.agent_verifications USING btree (agent_id);


--
-- Name: idx_agent_verifications_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_verifications_property ON public.agent_verifications USING btree (property_id);


--
-- Name: idx_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_action ON public.admin_audit_log USING btree (action, created_at DESC);


--
-- Name: idx_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: idx_bookings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_category ON public.bookings USING btree (category_id, checkin_date);


--
-- Name: idx_bookings_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_property ON public.bookings USING btree (property_id, checkin_date, checkout_date);


--
-- Name: idx_bookings_status_checkin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status_checkin ON public.bookings USING btree (status, checkin_date);


--
-- Name: idx_complaints_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_agent ON public.complaints USING btree (agent_id);


--
-- Name: idx_complaints_complainant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_complainant ON public.complaints USING btree (complainant_id);


--
-- Name: idx_complaints_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_property ON public.complaints USING btree (property_id);


--
-- Name: idx_complaints_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_status ON public.complaints USING btree (status);


--
-- Name: idx_escrow_auto_rel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escrow_auto_rel ON public.escrow_transactions USING btree (auto_release_at) WHERE (status = 'funded'::text);


--
-- Name: idx_escrow_idem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escrow_idem ON public.escrow_transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_escrow_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escrow_type ON public.escrow_transactions USING btree (transaction_type);


--
-- Name: idx_hostel_enquiries_hostel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_enquiries_hostel ON public.hostel_enquiries USING btree (hostel_id);


--
-- Name: idx_inspections_buyer_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_buyer_property ON public.property_inspections USING btree (buyer_id, property_id, status);


--
-- Name: idx_loyalty_points_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_points_user ON public.loyalty_points USING btree (user_id);


--
-- Name: idx_matches_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_user ON public.matches USING btree (user_id);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, read, created_at DESC);


--
-- Name: idx_pro_activation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pro_activation_status ON public.pro_activation_requests USING btree (status);


--
-- Name: idx_pro_activation_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pro_activation_user_id ON public.pro_activation_requests USING btree (user_id);


--
-- Name: idx_pro_reviews_pro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pro_reviews_pro ON public.professional_reviews USING btree (professional_id);


--
-- Name: idx_profiles_account_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_account_status ON public.profiles USING btree (account_status);


--
-- Name: idx_profiles_device_fp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_device_fp ON public.profiles USING btree (device_fingerprint);


--
-- Name: idx_profiles_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_email_unique ON public.profiles USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_profiles_identity_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_identity_status ON public.profiles USING btree (identity_verification_status) WHERE (identity_verification_status = 'submitted'::text);


--
-- Name: idx_profiles_invite_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_invite_code ON public.profiles USING btree (invite_code);


--
-- Name: idx_profiles_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_invited_by ON public.profiles USING btree (invited_by);


--
-- Name: idx_profiles_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_phone_unique ON public.profiles USING btree (phone) WHERE ((phone IS NOT NULL) AND (phone <> ''::text));


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_properties_assigned_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_assigned_agent ON public.properties USING btree (assigned_agent_id);


--
-- Name: idx_properties_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_category ON public.properties USING btree (category, status);


--
-- Name: idx_properties_occupancy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_occupancy ON public.properties USING btree (category, occupancy_status) WHERE (category = ANY (ARRAY['rental'::text, 'shortlet'::text]));


--
-- Name: idx_properties_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_status ON public.properties USING btree (status);


--
-- Name: idx_property_interest_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_interest_property ON public.property_interest USING btree (property_id, status);


--
-- Name: idx_property_interest_referred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_interest_referred ON public.property_interest USING btree (referred_by);


--
-- Name: idx_referral_txn_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txn_payment ON public.referral_transactions USING btree (payment_id);


--
-- Name: idx_referral_txn_referee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txn_referee ON public.referral_transactions USING btree (referee_id);


--
-- Name: idx_referral_txn_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txn_referrer ON public.referral_transactions USING btree (referrer_id, status);


--
-- Name: idx_referral_txns_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txns_buyer ON public.referral_transactions USING btree (buyer_id);


--
-- Name: idx_referral_txns_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txns_referrer ON public.referral_transactions USING btree (referrer_id, status);


--
-- Name: idx_referral_txns_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txns_type ON public.referral_transactions USING btree (payout_type, status);


--
-- Name: idx_room_categories_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_categories_property ON public.room_categories USING btree (property_id);


--
-- Name: idx_student_hostels_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_hostels_institution ON public.student_hostels USING btree (institution_id);


--
-- Name: idx_student_hostels_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_hostels_state ON public.student_hostels USING btree (state);


--
-- Name: idx_student_hostels_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_hostels_status ON public.student_hostels USING btree (status);


--
-- Name: idx_student_verifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_verifications_user ON public.student_verifications USING btree (user_id);


--
-- Name: idx_swipes_user_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_swipes_user_action ON public.swipes USING btree (user_id, action);


--
-- Name: idx_testimonials_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_status ON public.testimonials USING btree (status);


--
-- Name: idx_testimonials_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_user ON public.testimonials USING btree (user_id);


--
-- Name: idx_user_earnings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_earnings_user_id ON public.user_earnings USING btree (user_id);


--
-- Name: matches_user_id_match_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_user_id_match_score_idx ON public.matches USING btree (user_id, match_score DESC);


--
-- Name: professionals_professional_type_is_active_is_verified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX professionals_professional_type_is_active_is_verified_idx ON public.professionals USING btree (professional_type, is_active, is_verified);


--
-- Name: properties_price_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_price_status_idx ON public.properties USING btree (price, status);


--
-- Name: properties_property_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_property_type_status_idx ON public.properties USING btree (property_type, status);


--
-- Name: properties_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_seller_id_idx ON public.properties USING btree (seller_id);


--
-- Name: properties_state_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_state_status_idx ON public.properties USING btree (state, status);


--
-- Name: swipes_user_id_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX swipes_user_id_action_idx ON public.swipes USING btree (user_id, action);


--
-- Name: agent_verifications trg_agent_score_on_verification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agent_score_on_verification AFTER INSERT OR UPDATE OF verdict ON public.agent_verifications FOR EACH ROW WHEN ((new.verdict = ANY (ARRAY['verified'::text, 'rejected'::text]))) EXECUTE FUNCTION public.fn_update_agent_score_on_verification();


--
-- Name: profiles trg_audit_identity_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_identity_status AFTER UPDATE OF identity_verification_status ON public.profiles FOR EACH ROW WHEN ((old.identity_verification_status IS DISTINCT FROM new.identity_verification_status)) EXECUTE FUNCTION public.fn_audit_admin_action('identity_status_change');


--
-- Name: properties trg_audit_property_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_property_status AFTER UPDATE OF status ON public.properties FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.fn_audit_admin_action('property_status_change');


--
-- Name: deed_submissions trg_check_deed_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_deed_completion AFTER INSERT OR UPDATE OF has_legal_stamp ON public.deed_submissions FOR EACH ROW EXECUTE FUNCTION public.fn_check_deed_completion();


--
-- Name: mortgage_applications trg_generate_mortgage_ticket_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_mortgage_ticket_id BEFORE INSERT ON public.mortgage_applications FOR EACH ROW WHEN ((new.ticket_id IS NULL)) EXECUTE FUNCTION public.generate_mortgage_ticket_id();


--
-- Name: profiles trg_init_agent_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_init_agent_score AFTER INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fn_init_agent_score();


--
-- Name: contracts trg_initialize_escrow; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_initialize_escrow AFTER UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.trigger_initialize_escrow();


--
-- Name: complaints trg_populate_complaint_agent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_populate_complaint_agent BEFORE INSERT ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.fn_populate_complaint_agent();


--
-- Name: escrow_transactions trg_post_release_split; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_release_split AFTER UPDATE OF status ON public.escrow_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_post_release_split();


--
-- Name: complaints trg_process_complaint_resolution; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_process_complaint_resolution AFTER UPDATE OF status ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.fn_process_complaint_resolution();


--
-- Name: escrow_transactions trg_release_on_confirm; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_release_on_confirm BEFORE UPDATE OF confirmed_at ON public.escrow_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_release_on_move_in_confirm();


--
-- Name: properties trg_sanitize_property; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sanitize_property BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.fn_sanitize_property_inputs();


--
-- Name: testimonials trg_sanitize_testimonial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sanitize_testimonial BEFORE INSERT OR UPDATE ON public.testimonials FOR EACH ROW EXECUTE FUNCTION public.fn_sanitize_testimonial_inputs();


--
-- Name: escrow_transactions trg_set_auto_release; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_auto_release BEFORE INSERT OR UPDATE OF move_in_date ON public.escrow_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_set_auto_release();


--
-- Name: user_earnings user_earnings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_earnings_updated_at BEFORE UPDATE ON public.user_earnings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_announcements admin_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_announcements
    ADD CONSTRAINT admin_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_accounts agent_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_accounts agent_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_assignments agent_assignments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_assignments agent_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_assignments agent_assignments_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: agent_payments agent_payments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_payments agent_payments_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: agent_scores agent_scores_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_scores
    ADD CONSTRAINT agent_scores_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_verifications agent_verifications_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_verifications agent_verifications_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: agent_verifications agent_verifications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: bank_details bank_details_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_details
    ADD CONSTRAINT bank_details_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.room_categories(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: checkin_tokens checkin_tokens_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_transactions(id) ON DELETE CASCADE;


--
-- Name: checkin_tokens checkin_tokens_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.profiles(id);


--
-- Name: checkin_tokens checkin_tokens_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: checkin_tokens checkin_tokens_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES public.profiles(id);


--
-- Name: complaints complaints_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_complainant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_complainant_id_fkey FOREIGN KEY (complainant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: complaints complaints_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id);


--
-- Name: complaints complaints_verification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_verification_id_fkey FOREIGN KEY (verification_id) REFERENCES public.agent_verifications(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id);


--
-- Name: contracts contracts_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id);


--
-- Name: crypto_payments crypto_payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_payments
    ADD CONSTRAINT crypto_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: crypto_wallets crypto_wallets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_wallets
    ADD CONSTRAINT crypto_wallets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deal_agreements deal_agreements_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deal_agreements deal_agreements_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: deed_submissions deed_submissions_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_submissions
    ADD CONSTRAINT deed_submissions_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_transactions(id) ON DELETE CASCADE;


--
-- Name: deed_submissions deed_submissions_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_submissions
    ADD CONSTRAINT deed_submissions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: deed_submissions deed_submissions_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_submissions
    ADD CONSTRAINT deed_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id);


--
-- Name: disputes disputes_against_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_against_id_fkey FOREIGN KEY (against_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: disputes disputes_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: disputes disputes_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: hostel_enquiries hostel_enquiries_hostel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_enquiries
    ADD CONSTRAINT hostel_enquiries_hostel_id_fkey FOREIGN KEY (hostel_id) REFERENCES public.student_hostels(id) ON DELETE CASCADE;


--
-- Name: hostel_enquiries hostel_enquiries_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_enquiries
    ADD CONSTRAINT hostel_enquiries_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: hostel_payments hostel_payments_hostel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_payments
    ADD CONSTRAINT hostel_payments_hostel_id_fkey FOREIGN KEY (hostel_id) REFERENCES public.student_hostels(id) ON DELETE SET NULL;


--
-- Name: hostel_payments hostel_payments_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_payments
    ADD CONSTRAINT hostel_payments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: loyalty_points loyalty_points_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: matches matches_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: matches matches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: messages messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: mortgage_applications mortgage_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mortgage_applications
    ADD CONSTRAINT mortgage_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pinecone_index_status pinecone_index_status_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinecone_index_status
    ADD CONSTRAINT pinecone_index_status_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pro_activation_requests pro_activation_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_activation_requests
    ADD CONSTRAINT pro_activation_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: pro_activation_requests pro_activation_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_activation_requests
    ADD CONSTRAINT pro_activation_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: professional_applications professional_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: professional_requests professional_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_requests
    ADD CONSTRAINT professional_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: professional_reviews professional_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_reviews
    ADD CONSTRAINT professional_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: professionals professionals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professionals
    ADD CONSTRAINT professionals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_identity_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_identity_verified_by_fkey FOREIGN KEY (identity_verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: properties properties_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: property_images property_images_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT property_images_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_inspections property_inspections_assigned_agent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_assigned_agent_fkey FOREIGN KEY (assigned_agent) REFERENCES public.profiles(id);


--
-- Name: property_inspections property_inspections_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: property_inspections property_inspections_landlord_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_landlord_id_fkey FOREIGN KEY (landlord_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: property_inspections property_inspections_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_interest property_interest_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_interest property_interest_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: property_interest property_interest_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: property_reviews property_reviews_landlord_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_reviews
    ADD CONSTRAINT property_reviews_landlord_id_fkey FOREIGN KEY (landlord_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: property_reviews property_reviews_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_reviews
    ADD CONSTRAINT property_reviews_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_reviews property_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_reviews
    ADD CONSTRAINT property_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: referral_transactions referral_transactions_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_transactions
    ADD CONSTRAINT referral_transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: referral_transactions referral_transactions_referee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_transactions
    ADD CONSTRAINT referral_transactions_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: referral_transactions referral_transactions_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_transactions
    ADD CONSTRAINT referral_transactions_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rental_enquiries rental_enquiries_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_enquiries
    ADD CONSTRAINT rental_enquiries_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: room_categories room_categories_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_categories
    ADD CONSTRAINT room_categories_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: student_hostels student_hostels_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hostels
    ADD CONSTRAINT student_hostels_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: student_hostels student_hostels_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hostels
    ADD CONSTRAINT student_hostels_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: student_hostels student_hostels_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hostels
    ADD CONSTRAINT student_hostels_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);


--
-- Name: student_verifications student_verifications_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: student_verifications student_verifications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: student_verifications student_verifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: swipes swipes_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: swipes swipes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: testimonials testimonials_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: testimonials testimonials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_earnings user_earnings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_earnings
    ADD CONSTRAINT user_earnings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wallet_ledger wallet_ledger_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_transactions(id);


--
-- Name: wallet_ledger wallet_ledger_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id);


--
-- Name: professionals Active professionals are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active professionals are public" ON public.professionals FOR SELECT USING (((is_active = true) AND (is_verified = true)));


--
-- Name: properties Active properties are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active properties are public" ON public.properties FOR SELECT USING ((status = 'active'::text));


--
-- Name: profiles Admin can update account status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update account status" ON public.profiles FOR UPDATE USING (((auth.uid() = id) OR ((auth.jwt() ->> 'email'::text) = 'divineandbassey@gmail.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'prosperwithbassey@gmail.com'::text)));


--
-- Name: student_hostels Admin manage all hostels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage all hostels" ON public.student_hostels USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'verifier'::text]))))));


--
-- Name: student_verifications Admin read all verifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin read all verifications" ON public.student_verifications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'verifier'::text]))))));


--
-- Name: rental_enquiries Admin reads enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin reads enquiries" ON public.rental_enquiries FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: student_verifications Admin update verifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin update verifications" ON public.student_verifications FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'verifier'::text]))))));


--
-- Name: properties Admins and agents manage all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and agents manage all properties" ON public.properties FOR UPDATE USING (((auth.uid() = seller_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'agent'::text])))))));


--
-- Name: properties Admins can update any property; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any property" ON public.properties FOR UPDATE USING (((seller_id = auth.uid()) OR public.is_admin()));


--
-- Name: properties Admins can view all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (seller_id = auth.uid()) OR public.is_admin()));


--
-- Name: profiles Admins full access profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access profiles" ON public.profiles USING (public.is_admin());


--
-- Name: agent_accounts Admins manage agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage agents" ON public.agent_accounts USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: properties Admins manage all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage all properties" ON public.properties USING (public.is_staff());


--
-- Name: pinecone_index_status Admins manage pinecone status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage pinecone status" ON public.pinecone_index_status USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: professional_applications Admins manage professionals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage professionals" ON public.professional_applications USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));


--
-- Name: referral_transactions Admins manage referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage referrals" ON public.referral_transactions USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'agent'::text])));


--
-- Name: crypto_payments Admins read all crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all crypto" ON public.crypto_payments FOR SELECT USING (((auth.uid() = user_id) OR (user_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));


--
-- Name: escrow_transactions Admins read all escrow; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all escrow" ON public.escrow_transactions FOR SELECT USING (((auth.uid() = tenant_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));


--
-- Name: payments Admins read all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all payments" ON public.payments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: admin_audit_log Admins read audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read audit log" ON public.admin_audit_log FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: mortgage_applications Admins read mortgage apps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read mortgage apps" ON public.mortgage_applications FOR SELECT USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));


--
-- Name: disputes Admins resolve disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins resolve disputes" ON public.disputes FOR UPDATE USING (public.is_staff());


--
-- Name: bookings Admins update bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update bookings" ON public.bookings FOR UPDATE USING (public.is_staff());


--
-- Name: crypto_payments Admins update crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update crypto" ON public.crypto_payments FOR UPDATE USING (public.is_staff());


--
-- Name: escrow_transactions Admins update escrow; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update escrow" ON public.escrow_transactions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: payments Admins update payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update payments" ON public.payments FOR UPDATE USING (public.is_staff());


--
-- Name: payments Admins view all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all payments" ON public.payments FOR SELECT USING (public.is_staff());


--
-- Name: agent_scores Agent reads own score; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent reads own score" ON public.agent_scores FOR SELECT USING (((agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: complaints Agent responds to complaint; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent responds to complaint" ON public.complaints FOR UPDATE USING (((agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: agent_verifications Agent submits own verifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent submits own verifications" ON public.agent_verifications FOR INSERT WITH CHECK ((agent_id = auth.uid()));


--
-- Name: agent_verifications Agent updates own pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent updates own pending" ON public.agent_verifications FOR UPDATE USING ((((agent_id = auth.uid()) AND (verdict = 'pending'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK ((((agent_id = auth.uid()) AND (verdict = 'pending'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: agent_verifications Agent views own verifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent views own verifications" ON public.agent_verifications FOR SELECT USING (((agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: agent_assignments Agents see own assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents see own assignments" ON public.agent_assignments USING (((auth.uid() = agent_id) OR (auth.uid() = assigned_by)));


--
-- Name: agent_accounts Agents see own record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents see own record" ON public.agent_accounts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: agent_payments Agents view own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents view own payments" ON public.agent_payments FOR SELECT USING ((auth.uid() = agent_id));


--
-- Name: admin_announcements Announcements manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements manage" ON public.admin_announcements USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: admin_announcements Announcements select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements select" ON public.admin_announcements FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: professional_reviews Anyone can read reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read reviews" ON public.professional_reviews FOR SELECT USING (true);


--
-- Name: crypto_payments Anyone can submit crypto payment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit crypto payment" ON public.crypto_payments FOR INSERT WITH CHECK (true);


--
-- Name: rental_enquiries Anyone can submit enquiry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit enquiry" ON public.rental_enquiries FOR INSERT WITH CHECK (true);


--
-- Name: mortgage_applications Anyone can submit mortgage app; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit mortgage app" ON public.mortgage_applications FOR INSERT WITH CHECK (true);


--
-- Name: crypto_wallets Anyone can view active crypto wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active crypto wallets" ON public.crypto_wallets FOR SELECT USING (true);


--
-- Name: platform_settings Anyone can view settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view settings" ON public.platform_settings FOR SELECT USING (true);


--
-- Name: admin_audit_log Anyone insert audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone insert audit log" ON public.admin_audit_log FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: bookings Auth users can create bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users can create bookings" ON public.bookings FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: professional_reviews Auth users can write reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users can write reviews" ON public.professional_reviews FOR INSERT WITH CHECK ((auth.uid() = reviewer_id));


--
-- Name: deal_agreements Auth users create agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users create agreements" ON public.deal_agreements FOR INSERT WITH CHECK ((auth.uid() = buyer_id));


--
-- Name: disputes Auth users file disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users file disputes" ON public.disputes FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: crypto_payments Auth users submit crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users submit crypto" ON public.crypto_payments FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: property_reviews Auth users write reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users write reviews" ON public.property_reviews FOR INSERT WITH CHECK ((auth.uid() = reviewer_id));


--
-- Name: professional_applications Authenticated users can apply; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can apply" ON public.professional_applications FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = user_id)));


--
-- Name: deal_agreements Authenticated users can create agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create agreements" ON public.deal_agreements FOR INSERT WITH CHECK ((auth.uid() = buyer_id));


--
-- Name: bookings Authenticated users can create bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create bookings" ON public.bookings FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: professional_requests Authenticated users can request professionals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can request professionals" ON public.professional_requests FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = user_id)));


--
-- Name: crypto_payments Authenticated users can submit crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can submit crypto" ON public.crypto_payments FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = user_id)));


--
-- Name: rental_enquiries Authenticated users can submit enquiry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can submit enquiry" ON public.rental_enquiries FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: deal_agreements Buyers can view own agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers can view own agreements" ON public.deal_agreements FOR SELECT USING ((auth.uid() = buyer_id));


--
-- Name: deal_agreements Buyers view own agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers view own agreements" ON public.deal_agreements FOR SELECT USING ((auth.uid() = buyer_id));


--
-- Name: complaints Complaints visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Complaints visibility" ON public.complaints FOR SELECT USING (((complainant_id = auth.uid()) OR (agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: contracts Contract parties access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Contract parties access" ON public.contracts USING (((buyer_id = auth.uid()) OR (seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: deed_submissions Deed: parties access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Deed: parties access" ON public.deed_submissions USING (((submitted_by = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK ((submitted_by = auth.uid()));


--
-- Name: escrow_transactions Escrow strict select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrow strict select" ON public.escrow_transactions FOR SELECT USING (((tenant_id = auth.uid()) OR (buyer_id = auth.uid()) OR (seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'lender'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: escrow_transactions Escrow strict update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrow strict update" ON public.escrow_transactions FOR UPDATE USING ((((tenant_id = auth.uid()) AND (status = 'funded'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK ((((tenant_id = auth.uid()) AND (status = 'funded'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: bookings Guests view own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Guests view own bookings" ON public.bookings FOR SELECT USING (((auth.uid() = user_id) OR (property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.seller_id = auth.uid()))) OR public.is_staff()));


--
-- Name: property_inspections Inspection parties access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Inspection parties access" ON public.property_inspections USING (((buyer_id = auth.uid()) OR (landlord_id = auth.uid()) OR (assigned_agent = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK ((buyer_id = auth.uid()));


--
-- Name: property_inspections Landlord agent update inspection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Landlord agent update inspection" ON public.property_inspections FOR UPDATE USING (((landlord_id = auth.uid()) OR (assigned_agent = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'agent'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((landlord_id = auth.uid()) OR (assigned_agent = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'agent'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: wallet_ledger Ledger: recipient reads own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Ledger: recipient reads own" ON public.wallet_ledger FOR SELECT USING (((recipient_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: mortgage_applications Lenders can update mortgage applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lenders can update mortgage applications" ON public.mortgage_applications FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'lender'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'lender'::text)))));


--
-- Name: mortgage_applications Lenders can view all mortgage applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lenders can view all mortgage applications" ON public.mortgage_applications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'lender'::text)))));


--
-- Name: mortgage_applications Mortgage insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mortgage insert" ON public.mortgage_applications FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: mortgage_applications Mortgage select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mortgage select" ON public.mortgage_applications FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'lender'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: mortgage_applications Mortgage update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mortgage update" ON public.mortgage_applications FOR UPDATE USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'lender'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'lender'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: student_hostels Owner insert hostel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner insert hostel" ON public.student_hostels FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: hostel_payments Owner inserts hostel payment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner inserts hostel payment" ON public.hostel_payments FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: hostel_enquiries Owner reads own hostel enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner reads own hostel enquiries" ON public.hostel_enquiries FOR SELECT USING (((auth.uid() = student_id) OR (EXISTS ( SELECT 1
   FROM public.student_hostels h
  WHERE ((h.id = hostel_enquiries.hostel_id) AND (h.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));


--
-- Name: hostel_payments Owner reads own hostel payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner reads own hostel payments" ON public.hostel_payments FOR SELECT USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));


--
-- Name: student_hostels Owner update hostel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner update hostel" ON public.student_hostels FOR UPDATE USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));


--
-- Name: bookings Owners can manage bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage bookings" ON public.bookings USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.seller_id = auth.uid()))));


--
-- Name: room_categories Owners manage room categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners manage room categories" ON public.room_categories USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.seller_id = auth.uid()))));


--
-- Name: profiles Profile select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profile select" ON public.profiles FOR SELECT USING (((auth.uid() = id) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: profiles Profile update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profile update" ON public.profiles FOR UPDATE USING (((auth.uid() = id) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((auth.uid() = id) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: property_images Property images are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Property images are public" ON public.property_images FOR SELECT USING (true);


--
-- Name: properties Property insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Property insert" ON public.properties FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: properties Property select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Property select" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'agent'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: properties Property update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Property update" ON public.properties FOR UPDATE USING (((seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: professional_applications Public can insert applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can insert applications" ON public.professional_applications FOR INSERT WITH CHECK (true);


--
-- Name: student_hostels Public read active hostels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read active hostels" ON public.student_hostels FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = owner_id)));


--
-- Name: properties Public read active properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read active properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = seller_id) OR public.is_staff()));


--
-- Name: institutions Public read institutions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read institutions" ON public.institutions FOR SELECT USING (true);


--
-- Name: pinecone_index_status Public read pinecone status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read pinecone status" ON public.pinecone_index_status FOR SELECT USING (true);


--
-- Name: property_reviews Public read property reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read property reviews" ON public.property_reviews FOR SELECT USING (true);


--
-- Name: room_categories Public read room categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read room categories" ON public.room_categories FOR SELECT USING (true);


--
-- Name: testimonials Public reads approved testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public reads approved testimonials" ON public.testimonials FOR SELECT USING ((status = 'approved'::text));


--
-- Name: referral_transactions Referrers see own earnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers see own earnings" ON public.referral_transactions FOR SELECT USING ((auth.uid() = referrer_id));


--
-- Name: profiles Self or staff reads profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Self or staff reads profiles" ON public.profiles FOR SELECT USING (((auth.uid() = id) OR public.is_admin_staff()));


--
-- Name: properties Sellers can delete own props; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can delete own props" ON public.properties FOR DELETE USING ((auth.uid() = seller_id));


--
-- Name: properties Sellers can insert properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can insert properties" ON public.properties FOR INSERT WITH CHECK ((auth.uid() = seller_id));


--
-- Name: property_images Sellers can manage images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can manage images" ON public.property_images USING ((auth.uid() = ( SELECT properties.seller_id
   FROM public.properties
  WHERE (properties.id = property_images.property_id))));


--
-- Name: properties Sellers can update own props; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can update own props" ON public.properties FOR UPDATE USING ((auth.uid() = seller_id));


--
-- Name: properties Sellers manage own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers manage own properties" ON public.properties USING ((auth.uid() = seller_id));


--
-- Name: property_interest Sellers see interests on own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers see interests on own properties" ON public.property_interest FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.properties
  WHERE ((properties.id = property_interest.property_id) AND (properties.seller_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'agent'::text])))))));


--
-- Name: payments Service inserts payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service inserts payments" ON public.payments FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: user_earnings Service role can insert earnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert earnings" ON public.user_earnings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: payments Service role inserts payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role inserts payments" ON public.payments FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: properties Staff can view all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view all properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = seller_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'agent'::text, 'verifier'::text])))))));


--
-- Name: bank_details Staff can view bank details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view bank details" ON public.bank_details FOR SELECT USING ((((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'agent'::text, 'senior_agent'::text, 'regional_coordinator'::text])))))));


--
-- Name: payments Staff reads all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads all payments" ON public.payments FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin_staff()));


--
-- Name: properties Staff reads all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads all properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = seller_id) OR public.is_admin_staff()));


--
-- Name: mortgage_applications Staff reads mortgage applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads mortgage applications" ON public.mortgage_applications FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin_staff()));


--
-- Name: professional_applications Staff reads professional applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads professional applications" ON public.professional_applications FOR SELECT USING (public.is_admin_staff());


--
-- Name: rental_enquiries Staff reads rental enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads rental enquiries" ON public.rental_enquiries FOR SELECT USING (public.is_admin_staff());


--
-- Name: hostel_enquiries Student inserts enquiry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student inserts enquiry" ON public.hostel_enquiries FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: student_verifications Student verification select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student verification select" ON public.student_verifications FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: student_verifications Student verification update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student verification update" ON public.student_verifications FOR UPDATE USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: platform_settings Superadmin can insert settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can insert settings" ON public.platform_settings FOR INSERT WITH CHECK (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])));


--
-- Name: bank_details Superadmin can manage bank details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage bank details" ON public.bank_details USING (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))) WITH CHECK (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])));


--
-- Name: crypto_wallets Superadmin can manage crypto wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage crypto wallets" ON public.crypto_wallets USING (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))) WITH CHECK (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])));


--
-- Name: platform_settings Superadmin can update settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can update settings" ON public.platform_settings FOR UPDATE USING (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])));


--
-- Name: notifications System can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: referral_transactions System can insert referral transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert referral transactions" ON public.referral_transactions FOR INSERT WITH CHECK (true);


--
-- Name: loyalty_points System manages points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System manages points" ON public.loyalty_points WITH CHECK (true);


--
-- Name: agent_scores System updates scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System updates scores" ON public.agent_scores USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: checkin_tokens Token: guest reads own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Token: guest reads own" ON public.checkin_tokens FOR SELECT USING (((guest_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: student_verifications User manage own verification; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User manage own verification" ON public.student_verifications USING ((auth.uid() = user_id));


--
-- Name: properties Users can insert own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own properties" ON public.properties FOR INSERT WITH CHECK ((auth.uid() = seller_id));


--
-- Name: properties Users can update own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own properties" ON public.properties FOR UPDATE USING ((auth.uid() = seller_id));


--
-- Name: properties Users can view all active properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all active properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = seller_id)));


--
-- Name: professional_applications Users can view own applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own applications" ON public.professional_applications FOR SELECT USING (((auth.uid() = user_id) OR (user_id IS NULL)));


--
-- Name: user_earnings Users can view own earnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own earnings" ON public.user_earnings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: payments Users can view own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING ((email = (( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text));


--
-- Name: complaints Users file complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users file complaints" ON public.complaints FOR INSERT WITH CHECK ((complainant_id = auth.uid()));


--
-- Name: profiles Users insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: mortgage_applications Users manage own applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own applications" ON public.mortgage_applications USING ((auth.uid() = user_id));


--
-- Name: property_interest Users manage own interests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own interests" ON public.property_interest USING ((auth.uid() = user_id));


--
-- Name: matches Users manage own matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own matches" ON public.matches USING ((auth.uid() = user_id));


--
-- Name: swipes Users manage own swipes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own swipes" ON public.swipes USING ((auth.uid() = user_id));


--
-- Name: testimonials Users read own testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own testimonials" ON public.testimonials FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: disputes Users see own disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own disputes" ON public.disputes USING ((auth.uid() = reporter_id));


--
-- Name: messages Users see own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own messages" ON public.messages USING (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));


--
-- Name: professional_requests Users see own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own requests" ON public.professional_requests FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: testimonials Users submit own testimonial; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users submit own testimonial" ON public.testimonials FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (status = 'pending'::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.testimonials t
  WHERE ((t.user_id = auth.uid()) AND (t.status <> 'rejected'::text)))))));


--
-- Name: notifications Users update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (((id = auth.uid()) OR public.is_staff()));


--
-- Name: crypto_payments Users view own crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own crypto" ON public.crypto_payments FOR SELECT USING ((((auth.uid())::text = (user_id)::text) OR public.is_staff()));


--
-- Name: crypto_payments Users view own crypto payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own crypto payments" ON public.crypto_payments FOR SELECT USING (((auth.uid() = user_id) OR (user_id IS NULL)));


--
-- Name: notifications Users view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: payments Users view own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own payments" ON public.payments FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: loyalty_points Users view own points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own points" ON public.loyalty_points FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (((id = auth.uid()) OR public.is_staff()));


--
-- Name: referral_transactions Users view own referral transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own referral transactions" ON public.referral_transactions FOR SELECT USING ((auth.uid() = referrer_id));


--
-- Name: disputes Users view relevant disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view relevant disputes" ON public.disputes FOR SELECT USING (((auth.uid() = reporter_id) OR (property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.seller_id = auth.uid()))) OR public.is_staff()));


--
-- Name: profiles admin_all_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_profiles ON public.profiles USING (public.is_admin());


--
-- Name: admin_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: checkin_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkin_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: complaints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: crypto_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crypto_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: crypto_wallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crypto_wallets ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: deed_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deed_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: disputes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

--
-- Name: escrow_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_enquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_enquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

--
-- Name: matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: mortgage_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mortgage_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles own_profile_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_profile_insert ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: profiles own_profile_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_profile_update ON public.profiles FOR UPDATE USING ((id = auth.uid()));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: pinecone_index_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pinecone_index_status ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: pro_activation_requests pro_activation: owner can insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pro_activation: owner can insert" ON public.pro_activation_requests FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: pro_activation_requests pro_activation: owner can select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pro_activation: owner can select" ON public.pro_activation_requests FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: pro_activation_requests pro_activation: service role can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pro_activation: service role can update" ON public.pro_activation_requests FOR UPDATE USING ((auth.role() = 'service_role'::text));


--
-- Name: pro_activation_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pro_activation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: professionals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_policy ON public.profiles FOR SELECT USING (((auth.uid() = id) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'agent'::text, 'verifier'::text]))));


--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: property_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;

--
-- Name: property_inspections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_inspections ENABLE ROW LEVEL SECURITY;

--
-- Name: property_interest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_interest ENABLE ROW LEVEL SECURITY;

--
-- Name: property_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: rental_enquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rental_enquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: room_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: student_hostels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_hostels ENABLE ROW LEVEL SECURITY;

--
-- Name: student_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: swipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;

--
-- Name: testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: user_earnings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_earnings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_earnings user_earnings: owner can insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_earnings: owner can insert" ON public.user_earnings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_earnings user_earnings: owner can select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_earnings: owner can select" ON public.user_earnings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_earnings user_earnings: service role can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_earnings: service role can update" ON public.user_earnings FOR UPDATE USING ((auth.role() = 'service_role'::text));


--
-- Name: wallet_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime notifications; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.notifications;


--

-- ============================================================
-- SOURCE: 20260731000000_multicategory_catalog.sql
-- ============================================================

-- ============================================================================
-- DealMatch Multi-Category Catalog
-- Adds dynamic-category support (Automotive, Artisans, Corporate Services,
-- Talent/Teacher Recruitment) alongside the existing Real Estate schema.
-- This migration is ADDITIVE ONLY: it does not touch properties,
-- student_hostels, professionals, or any other existing table.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_net;      -- required for the webhook trigger below

-- ── 1. Categories ────────────────────────────────────────────────────────────
CREATE TABLE public.categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  parent_id INT REFERENCES public.categories(id) ON DELETE CASCADE,
  attribute_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.categories IS
  'New category metadata + JSON Schema for dynamic attribute validation. '
  'A new category is added by inserting a row here, no DDL migration required.';

-- ── 2. Unified listings table for new categories ───────────────────────────
CREATE TABLE public.category_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id INT NOT NULL REFERENCES public.categories(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('SUPPLY', 'DEMAND')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price_cents BIGINT,
  status VARCHAR(50) DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'MATCHED', 'SUSPENDED', 'CLOSED')),
  location GEOGRAPHY(POINT, 4326),
  location_name VARCHAR(255),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_category_listings_cat_type ON public.category_listings(category_id, type);
CREATE INDEX idx_category_listings_status   ON public.category_listings(status);
CREATE INDEX idx_category_listings_location ON public.category_listings USING GIST(location);
CREATE INDEX idx_category_listings_attrs    ON public.category_listings USING GIN(attributes);
CREATE INDEX idx_category_listings_user     ON public.category_listings(user_id);

-- keep updated_at fresh, same pattern likely used elsewhere in this project
CREATE OR REPLACE FUNCTION set_category_listings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_listings_updated_at
  BEFORE UPDATE ON public.category_listings
  FOR EACH ROW EXECUTE FUNCTION set_category_listings_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "listings_public_read_active" ON public.category_listings
  FOR SELECT USING (status = 'ACTIVE');

CREATE POLICY "listings_owner_read_own" ON public.category_listings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "listings_owner_insert" ON public.category_listings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "listings_owner_update" ON public.category_listings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "listings_owner_delete" ON public.category_listings
  FOR DELETE USING (auth.uid() = user_id);

-- ── 4. Matching RPC: JSONB containment + PostGIS radius search ─────────────
CREATE OR REPLACE FUNCTION match_category_listings(
  p_category_id INT,
  p_type VARCHAR,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_m INT DEFAULT 10000,
  p_attribute_filter JSONB DEFAULT '{}'::jsonb,
  p_limit INT DEFAULT 50
)
RETURNS SETOF public.category_listings
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM public.category_listings
  WHERE category_id = p_category_id
    AND type = p_type
    AND status = 'ACTIVE'
    AND (
      p_lat IS NULL OR p_lng IS NULL OR location IS NULL
      OR ST_DWithin(location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
    )
    AND attributes @> p_attribute_filter
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND location IS NOT NULL
      THEN location <-> ST_MakePoint(p_lng, p_lat)::geography
      ELSE NULL
    END NULLS LAST,
    created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION match_category_listings IS
  'Combines JSONB attribute containment with PostGIS radius search. '
  'Called via supabase.rpc(''match_category_listings'', {...}) from api/platform.js (resource=category-match).';

-- ── 5. Async event notification (replaces the in-process event bus) ────────
-- On INSERT of a new SUPPLY/DEMAND listing, fire an HTTP POST to the Vercel
-- endpoint that would previously have subscribed to `supply.created` /
-- `demand.created` on an in-process bus. Requires `app.settings.app_url` to
-- be set (see setup note at bottom of file) and `pg_net` enabled above.
CREATE OR REPLACE FUNCTION notify_listing_created()
RETURNS TRIGGER AS $$
DECLARE
  target_url TEXT := current_setting('app.settings.listing_webhook_url', true);
BEGIN
  IF target_url IS NOT NULL AND target_url <> '' THEN
    PERFORM net.http_post(
      url := target_url,
      body := jsonb_build_object(
        'eventName', lower(NEW.type) || '.created',
        'payload', jsonb_build_object(
          'entityId', NEW.id,
          'categoryId', NEW.category_id,
          'type', NEW.type,
          'attributes', NEW.attributes
        ),
        'timestamp', NEW.created_at
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_listing_created
  AFTER INSERT ON public.category_listings
  FOR EACH ROW EXECUTE FUNCTION notify_listing_created();

-- ============================================================================
-- MANUAL SETUP STEP (cannot be scripted — run once per environment):
--   ALTER DATABASE postgres SET app.settings.listing_webhook_url =
--     'https://www.dealmatch.com.ng/api/events/listing-created';
--
-- If you'd rather configure this via the Supabase dashboard's Database
-- Webhooks UI instead of pg_net + this trigger, that works too — in that
-- case you can drop trg_notify_listing_created and notify_listing_created()
-- and point a dashboard webhook at the same /api/events/listing-created
-- endpoint. Either mechanism satisfies the same contract.
-- ============================================================================


-- ============================================================
-- SOURCE: 20260731000001_seed_initial_categories.sql
-- ============================================================

-- Seed the four new verticals from the architecture brief.
-- Schemas mirror src/modules/catalog/schemas/*.json — keep these in sync
-- manually for now (see note in catalogService.js about a future sync script).

INSERT INTO public.categories (slug, name, attribute_schema) VALUES
('teachers', 'Talent & Teacher Recruitment', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "years_experience": { "type": "integer", "minimum": 0 },
    "qualification": { "type": "string", "enum": ["B.Ed", "B.Sc", "M.Ed", "PGDE"] },
    "subject_specialities": { "type": "array", "items": { "type": "string" } },
    "employment_type": { "type": "string", "enum": ["FULL_TIME", "PART_TIME", "CONTRACT"] }
  },
  "required": ["qualification", "years_experience"]
}'::jsonb),

('artisans', 'Skilled Artisans', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "trade": { "type": "string", "enum": ["PLUMBER", "ELECTRICIAN", "CARPENTER", "PAINTER", "MASON", "WELDER", "AC_TECHNICIAN", "GENERAL_CONTRACTOR"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "rating": { "type": "number", "minimum": 0, "maximum": 5 },
    "has_tools": { "type": "boolean" },
    "availability": { "type": "string", "enum": ["IMMEDIATE", "WITHIN_WEEK", "SCHEDULED"] },
    "certifications": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["trade", "years_experience"]
}'::jsonb),

('corporate-services', 'Corporate Services', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["LEGAL", "ACCOUNTING", "CONSULTING", "IT_SUPPORT", "MARKETING", "HR", "LOGISTICS"] },
    "company_size_served": { "type": "string", "enum": ["STARTUP", "SME", "ENTERPRISE"] },
    "engagement_model": { "type": "string", "enum": ["ONE_OFF", "RETAINER", "PROJECT_BASED"] },
    "years_in_business": { "type": "integer", "minimum": 0 },
    "cac_registered": { "type": "boolean" }
  },
  "required": ["service_type", "engagement_model"]
}'::jsonb),

('automotive', 'Automotive', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "vehicle_type": { "type": "string", "enum": ["SEDAN", "SUV", "TRUCK", "BUS", "MOTORCYCLE", "TRICYCLE"] },
    "make": { "type": "string" },
    "model": { "type": "string" },
    "year": { "type": "integer", "minimum": 1980, "maximum": 2027 },
    "mileage_km": { "type": "integer", "minimum": 0 },
    "transmission": { "type": "string", "enum": ["MANUAL", "AUTOMATIC"] },
    "fuel_type": { "type": "string", "enum": ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"] },
    "condition": { "type": "string", "enum": ["NEW", "FOREIGN_USED", "NIGERIAN_USED"] }
  },
  "required": ["vehicle_type", "make", "model", "year"]
}'::jsonb)

ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- SOURCE: 20260731000002_forum_schema.sql
-- ============================================================

-- ============================================================================
-- DealMatch Community Forum
-- Additive only — does not touch any existing table. Built for SEO/AEO:
-- category-scoped long-tail Q&A/discussion content, permanent URLs (soft-hide
-- instead of hard-delete, since deleting indexed URLs is bad for SEO),
-- full-text search, and denormalized counters for fast listing pages.
-- ============================================================================

-- Shared updated_at trigger fn (generic name — the multicategory migration's
-- set_category_listings_updated_at() is table-specific and untouched here)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1. Forum categories ─────────────────────────────────────────────────────
-- Deliberately separate from `public.categories` (the dynamic-listing catalog
-- from the multicategory migration) — forum categories mirror ALL site
-- verticals, including the pre-existing ones (real-estate, rentals, hotels,
-- student-hostels, professionals) that don't live in `categories` at all.
CREATE TABLE public.forum_categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,                    -- shown on category page, used as meta description
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Threads ───────────────────────────────────────────────────────────────
CREATE TABLE public.forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id INT NOT NULL REFERENCES public.forum_categories(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL,           -- URL-safe, unique per category
  body TEXT NOT NULL,
  thread_type VARCHAR(20) NOT NULL DEFAULT 'DISCUSSION'
    CHECK (thread_type IN ('DISCUSSION', 'QUESTION')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED', 'HIDDEN')), -- HIDDEN = moderated; URL stays live, returns 404 to crawlers
  accepted_post_id UUID,                -- set after forum_posts exists below
  is_pinned BOOLEAN DEFAULT FALSE,
  view_count INT NOT NULL DEFAULT 0,
  reply_count INT NOT NULL DEFAULT 0,
  search_vector TSVECTOR,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, slug)
);

CREATE INDEX idx_forum_threads_category   ON public.forum_threads(category_id, status, is_pinned DESC, last_activity_at DESC);
CREATE INDEX idx_forum_threads_user       ON public.forum_threads(user_id);
CREATE INDEX idx_forum_threads_search     ON public.forum_threads USING GIN(search_vector);

CREATE TRIGGER trg_forum_threads_updated_at
  BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.forum_threads_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A')
                     || setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_forum_threads_search_vector
  BEFORE INSERT OR UPDATE OF title, body ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.forum_threads_search_vector_update();

-- ── 3. Posts (replies) ──────────────────────────────────────────────────────
CREATE TABLE public.forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,     -- soft delete: preserves reply numbering/permalinks
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_forum_posts_thread ON public.forum_posts(thread_id, created_at);
CREATE INDEX idx_forum_posts_user   ON public.forum_posts(user_id);

CREATE TRIGGER trg_forum_posts_updated_at
  BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.forum_threads
  ADD CONSTRAINT fk_forum_threads_accepted_post
  FOREIGN KEY (accepted_post_id) REFERENCES public.forum_posts(id) ON DELETE SET NULL;

-- ── 4. Counters: keep reply_count / last_activity_at in sync without an
--      app-level round trip on every reply ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.forum_posts_after_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_threads
      SET reply_count = reply_count + 1, last_activity_at = NOW()
      WHERE id = NEW.thread_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
    UPDATE public.forum_threads
      SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = NEW.thread_id;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_forum_posts_after_change
  AFTER INSERT OR UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.forum_posts_after_change();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_categories_public_read" ON public.forum_categories
  FOR SELECT USING (is_active = true);

-- Public read covers OPEN and CLOSED; HIDDEN threads are excluded here so a
-- moderated thread's content isn't readable via direct API/RLS bypass —
-- api/platform.js (render=html path) separately returns a real 404 status for HIDDEN threads.
CREATE POLICY "forum_threads_public_read" ON public.forum_threads
  FOR SELECT USING (status IN ('OPEN', 'CLOSED') OR auth.uid() = user_id);

CREATE POLICY "forum_threads_owner_insert" ON public.forum_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_threads_owner_update" ON public.forum_threads
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_posts_public_read" ON public.forum_posts
  FOR SELECT USING (is_deleted = false OR auth.uid() = user_id);

CREATE POLICY "forum_posts_owner_insert" ON public.forum_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_posts_owner_update" ON public.forum_posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 6. View-count increment RPC (avoids a race-prone read-then-write from the API) ─
CREATE OR REPLACE FUNCTION public.increment_thread_view_count(p_thread_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.forum_threads SET view_count = view_count + 1 WHERE id = p_thread_id;
$$;

-- SECURITY DEFINER is required here: view counting must work for anonymous
-- visitors, but forum_threads_owner_update only lets the thread's author
-- UPDATE via RLS. This function is intentionally narrow (one column, one
-- row, no user-controlled SQL) so bypassing RLS is safe.


-- ============================================================
-- SOURCE: 20260731000003_seed_forum_categories.sql
-- ============================================================

INSERT INTO public.forum_categories (slug, name, description, sort_order) VALUES
('real-estate',         'Real Estate',                'Buying, selling, and property advice across Nigeria.', 10),
('rentals',              'Rentals & Tenancy',          'Renting, landlords, tenancy agreements, and rent disputes.', 20),
('student-hostels',      'Student Hostels',            'Finding and living in student accommodation.', 30),
('hotels',               'Hotels & Shortlets',         'Short-stay bookings, hotel reviews, and travel questions.', 40),
('professionals',        'Real Estate Professionals',  'Working with agents, inspectors, and verified professionals.', 50),
('artisans',             'Skilled Artisans',           'Hiring plumbers, electricians, carpenters, and other tradespeople.', 60),
('corporate-services',   'Corporate Services',         'Legal, accounting, consulting, and other business services.', 70),
('automotive',           'Automotive',                 'Buying, selling, and maintaining vehicles.', 80),
('teachers',             'Talent & Teacher Recruitment','Hiring and job-seeking in education and other skilled roles.', 90),
('general',              'General Discussion',         'Anything else related to deals, matching, and the DealMatch community.', 100)
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- SOURCE: 20260731000004_expand_category_taxonomy.sql
-- ============================================================

-- ============================================================================
-- Category Taxonomy Expansion
-- Adds the Intent Filter dimension (Need a Service / Buying-Renting Assets /
-- Hiring-Matching Supply&Demand) and restructures the catalog into proper
-- parent/child groups per the July 2026 taxonomy brief. Additive only.
--
-- 'teachers' and 'corporate-services' from the original multicategory seed
-- are superseded by richer structures below (Education/Tutoring group and
-- Professional & Business Services group respectively) — deactivated, not
-- deleted, so nothing referencing them by category_id breaks.
-- ============================================================================

ALTER TABLE public.categories
  ADD COLUMN intent_filter VARCHAR(20)
    CHECK (intent_filter IN ('SERVICE', 'ASSET', 'SUPPLY_DEMAND'));

COMMENT ON COLUMN public.categories.intent_filter IS
  'UX grouping dimension, independent of the vertical hierarchy: '
  'SERVICE = hire a provider (artisans, tutors, event vendors, health/home care), '
  'ASSET = buy/rent a thing (real estate, automotive, machinery), '
  'SUPPLY_DEMAND = two-sided matching (haulage<->cargo, schools<->teachers, retail<->distributor). '
  'NULL on parent/container rows that just group children.';

UPDATE public.categories SET is_active = false WHERE slug IN ('teachers', 'corporate-services');

-- Tag existing standalone categories with their intent
UPDATE public.categories SET intent_filter = 'ASSET'   WHERE slug = 'automotive';
UPDATE public.categories SET intent_filter = 'SERVICE' WHERE slug = 'artisans';

-- ── Parent groups ────────────────────────────────────────────────────────────
INSERT INTO public.categories (slug, name, attribute_schema, intent_filter) VALUES
('professional-business-services', 'Professional & Business Services', '{}'::jsonb, NULL),
('education-tutoring-skill-exchange', 'Education, Tutoring & Skill Exchange', '{}'::jsonb, NULL),
('logistics-haulage-equipment-rental', 'Logistics, Haulage & Equipment Rental', '{}'::jsonb, NULL),
('events-hospitality-entertainment', 'Events, Hospitality & Entertainment', '{}'::jsonb, NULL),
('health-wellness-home-care', 'Health, Wellness & Home Care', '{}'::jsonb, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── Group 1: Professional & Business Services (SERVICE) ────────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'corporate-legal', 'Corporate & Legal', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["LAWYER", "TAX_ACCOUNTANT", "BUSINESS_REGISTRATION_AGENT", "AUDITOR"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "bar_or_professional_body": { "type": "string" },
    "rate_type": { "type": "string", "enum": ["HOURLY", "FIXED", "RETAINER"] }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'tech-digital-services', 'Tech & Digital Services', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["WEB_DEVELOPER", "GRAPHIC_DESIGNER", "COPYWRITER", "MEDIA_BUYER", "APP_DEVELOPER", "SOCIAL_MEDIA_MANAGER"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "portfolio_url": { "type": "string" },
    "rate_type": { "type": "string", "enum": ["HOURLY", "FIXED", "RETAINER"] }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'b2b-procurement', 'B2B Procurement', id, 'SUPPLY_DEMAND', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "role": { "type": "string", "enum": ["RETAILER", "DISTRIBUTOR", "WHOLESALER", "MANUFACTURER"] },
    "product_categories": { "type": "array", "items": { "type": "string" } },
    "minimum_order_value_cents": { "type": "integer", "minimum": 0 },
    "delivery_coverage": { "type": "string" }
  },
  "required": ["role", "product_categories"]
}'::jsonb
FROM public.categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

-- ── Group 2: Education, Tutoring & Skill Exchange (mixed) ───────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'private-special-education', 'Private & Special Education', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "subject_specialities": { "type": "array", "items": { "type": "string" } },
    "level": { "type": "string", "enum": ["PRIMARY", "SECONDARY", "JAMB_PREP", "WAEC_PREP", "SAT_PREP", "CODING", "OTHER"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "mode": { "type": "string", "enum": ["IN_PERSON", "ONLINE", "HYBRID"] }
  },
  "required": ["subject_specialities", "level"]
}'::jsonb
FROM public.categories WHERE slug = 'education-tutoring-skill-exchange'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'vocational-training', 'Vocational Training', id, 'SUPPLY_DEMAND', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "trade": { "type": "string" },
    "apprenticeship_duration_months": { "type": "integer", "minimum": 0 },
    "stipend_provided": { "type": "boolean" },
    "certification_provided": { "type": "boolean" }
  },
  "required": ["trade"]
}'::jsonb
FROM public.categories WHERE slug = 'education-tutoring-skill-exchange'
ON CONFLICT (slug) DO NOTHING;

-- ── Group 3: Logistics, Haulage & Equipment Rental (mixed) ──────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'interstate-haulage-freight', 'Inter-State Haulage & Freight', id, 'SUPPLY_DEMAND', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "vehicle_type": { "type": "string", "enum": ["FLATBED", "BOX_TRUCK", "TANKER", "REFRIGERATED", "CONTAINER"] },
    "route_origin": { "type": "string" },
    "route_destination": { "type": "string" },
    "capacity_tons": { "type": "number", "minimum": 0 },
    "return_leg_available": { "type": "boolean" }
  },
  "required": ["vehicle_type", "route_origin", "route_destination"]
}'::jsonb
FROM public.categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'heavy-machinery-asset-leasing', 'Heavy Machinery & Asset Leasing', id, 'ASSET', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "equipment_type": { "type": "string", "enum": ["EXCAVATOR", "BULLDOZER", "CRANE", "GENERATOR", "FORKLIFT", "INDUSTRIAL_MACHINERY", "OTHER"] },
    "make": { "type": "string" },
    "condition": { "type": "string", "enum": ["NEW", "USED"] },
    "lease_term": { "type": "string", "enum": ["DAILY", "WEEKLY", "MONTHLY", "LONG_TERM"] },
    "operator_included": { "type": "boolean" }
  },
  "required": ["equipment_type", "lease_term"]
}'::jsonb
FROM public.categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'agricultural-logistics', 'Agricultural Logistics', id, 'SUPPLY_DEMAND', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["TRACTOR_OPERATOR", "COLD_STORAGE", "BULK_PRODUCE_BUYER", "FARM_TRANSPORT"] },
    "produce_type": { "type": "array", "items": { "type": "string" } },
    "capacity_tons": { "type": "number", "minimum": 0 },
    "location_region": { "type": "string" }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

-- ── Group 4: Events, Hospitality & Entertainment (mixed) ────────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'event-ecosystem', 'Event Ecosystem', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "vendor_type": { "type": "string", "enum": ["PHOTOGRAPHER", "CATERER", "DJ", "HALL_RENTAL", "DECOR", "SECURITY_BOUNCER", "MC", "LIVE_BAND"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "capacity_guests": { "type": "integer", "minimum": 0 },
    "rate_type": { "type": "string", "enum": ["PER_EVENT", "HOURLY", "PACKAGE"] }
  },
  "required": ["vendor_type"]
}'::jsonb
FROM public.categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;

-- NOTE: short-stay lodging itself already lives on the existing /hotels
-- vertical (separate table, not this dynamic catalog) — this subcategory is
-- scoped to the parts of "Shortlet & Experience Hosts" that vertical doesn't
-- cover: tour guides and private chefs. Flagged for your review in case you'd
-- rather fold shortlet listings into this catalog instead of the /hotels
-- table long-term (see the open decisions note from the last architecture doc).
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'experience-hosts', 'Shortlet & Experience Hosts', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "experience_type": { "type": "string", "enum": ["TOUR_GUIDE", "PRIVATE_CHEF", "LOCAL_EXPERIENCE_HOST"] },
    "languages": { "type": "array", "items": { "type": "string" } },
    "location_region": { "type": "string" },
    "rate_type": { "type": "string", "enum": ["PER_HOUR", "PER_DAY", "PER_EXPERIENCE"] }
  },
  "required": ["experience_type"]
}'::jsonb
FROM public.categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;

-- ── Group 5: Health, Wellness & Home Care (SERVICE) ─────────────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'in-home-healthcare', 'In-Home Healthcare', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "provider_type": { "type": "string", "enum": ["PRIVATE_NURSE", "ELDERLY_CARE", "PHYSIOTHERAPIST", "HOME_LAB_SAMPLE_COLLECTOR"] },
    "license_number": { "type": "string" },
    "years_experience": { "type": "integer", "minimum": 0 },
    "availability": { "type": "string", "enum": ["IMMEDIATE", "SCHEDULED", "LIVE_IN"] }
  },
  "required": ["provider_type"]
}'::jsonb
FROM public.categories WHERE slug = 'health-wellness-home-care'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'fitness-lifestyle', 'Fitness & Lifestyle', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "provider_type": { "type": "string", "enum": ["PERSONAL_TRAINER", "DIETITIAN", "WELLNESS_COACH"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "specialities": { "type": "array", "items": { "type": "string" } },
    "mode": { "type": "string", "enum": ["IN_PERSON", "ONLINE", "HYBRID"] }
  },
  "required": ["provider_type"]
}'::jsonb
FROM public.categories WHERE slug = 'health-wellness-home-care'
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- SOURCE: 20260731000005_expand_forum_taxonomy.sql
-- ============================================================

-- ============================================================================
-- Forum Category Taxonomy Expansion
-- Mirrors 20260731000004_expand_category_taxonomy.sql so forum sections line
-- up with the dynamic-listing catalog groups. Additive only.
-- ============================================================================

ALTER TABLE public.forum_categories
  ADD COLUMN parent_id INT REFERENCES public.forum_categories(id) ON DELETE CASCADE;

CREATE INDEX idx_forum_categories_parent ON public.forum_categories(parent_id);

-- 'teachers' and 'corporate-services' forum sections are superseded by the
-- richer Education and Professional & Business Services groups below.
UPDATE public.forum_categories SET is_active = false WHERE slug IN ('teachers', 'corporate-services');

-- ── Parent groups ────────────────────────────────────────────────────────────
INSERT INTO public.forum_categories (slug, name, description, sort_order) VALUES
('professional-business-services', 'Professional & Business Services', 'Lawyers, accountants, freelancers, and B2B procurement for SMEs and startups.', 65),
('education-tutoring-skill-exchange', 'Education, Tutoring & Skill Exchange', 'Tutors, exam prep, coding instruction, and apprenticeship matching.', 66),
('logistics-haulage-equipment-rental', 'Logistics, Haulage & Equipment Rental', 'Freight, heavy machinery leasing, and agricultural logistics.', 67),
('events-hospitality-entertainment', 'Events, Hospitality & Entertainment', 'Event vendors, shortlet hosts, and local experience guides.', 68),
('health-wellness-home-care', 'Health, Wellness & Home Care', 'In-home healthcare and fitness/lifestyle providers.', 69)
ON CONFLICT (slug) DO NOTHING;

-- ── Children ─────────────────────────────────────────────────────────────────
INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'corporate-legal', 'Corporate & Legal', 'Lawyers, tax accountants, business registration, auditors.', 1, id
FROM public.forum_categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'tech-digital-services', 'Tech & Digital Services', 'Web/app developers, designers, copywriters, media buyers.', 2, id
FROM public.forum_categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'b2b-procurement', 'B2B Procurement', 'Retail shops sourcing directly from distributors and wholesalers.', 3, id
FROM public.forum_categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'private-special-education', 'Private & Special Education', 'Home tutors, JAMB/WAEC/SAT prep, coding instructors.', 1, id
FROM public.forum_categories WHERE slug = 'education-tutoring-skill-exchange'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'vocational-training', 'Vocational Training', 'Apprenticeship matching for technical trades.', 2, id
FROM public.forum_categories WHERE slug = 'education-tutoring-skill-exchange'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'interstate-haulage-freight', 'Inter-State Haulage & Freight', 'Cargo owners and return-leg truck drivers.', 1, id
FROM public.forum_categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'heavy-machinery-asset-leasing', 'Heavy Machinery & Asset Leasing', 'Excavators, generators, industrial equipment rentals.', 2, id
FROM public.forum_categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'agricultural-logistics', 'Agricultural Logistics', 'Tractor operators, cold storage, bulk produce buyers.', 3, id
FROM public.forum_categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'event-ecosystem', 'Event Ecosystem', 'Photographers, caterers, DJs, hall rentals, decor, security.', 1, id
FROM public.forum_categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'experience-hosts', 'Shortlet & Experience Hosts', 'Tour guides and private chefs (short-stay lodging itself lives under Hotels & Shortlets).', 2, id
FROM public.forum_categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'in-home-healthcare', 'In-Home Healthcare', 'Private nurses, elderly care, physiotherapists, home lab collectors.', 1, id
FROM public.forum_categories WHERE slug = 'health-wellness-home-care'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'fitness-lifestyle', 'Fitness & Lifestyle', 'Personal trainers, dietitians, wellness coaches.', 2, id
FROM public.forum_categories WHERE slug = 'health-wellness-home-care'
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- SOURCE: 20260731000006_forum_category_taglines.sql
-- ============================================================

-- ============================================================================
-- Forum Category Taglines
-- Adds the approved landing-page copy (headline-style tagline, distinct from
-- the plain informational `description`) to every forum category. Additive
-- only. See the approved copywriting draft for source copy.
-- ============================================================================

ALTER TABLE public.forum_categories ADD COLUMN tagline VARCHAR(255);

COMMENT ON COLUMN public.forum_categories.tagline IS
  'Punchy landing-page headline (e.g. "Rent Without the Runaround"), '
  'rendered as the page H1. `name` stays the plain category label used in '
  'breadcrumbs, nav, and SEO <title> tags; `description` stays the '
  'supporting subhead line.';

UPDATE public.forum_categories SET tagline = 'Own It, Rent It, or Flip It.', description = 'Verified listings, real inspection status, and sellers who actually respond.' WHERE slug = 'real-estate';
UPDATE public.forum_categories SET tagline = 'Rent Without the Runaround.', description = 'Real tenancy terms upfront: no surprise agent fees at the door.' WHERE slug = 'rentals';
UPDATE public.forum_categories SET tagline = 'A Hostel Room, Not a Gamble.', description = 'See it, verify it, book it, before you show up with your bags.' WHERE slug = 'student-hostels';
UPDATE public.forum_categories SET tagline = 'Stay Somewhere Real.', description = 'Short stays with honest photos and hosts who confirm before you pay.' WHERE slug = 'hotels';
UPDATE public.forum_categories SET tagline = 'Work With Someone Who''s Actually Vetted.', description = 'Agents and inspectors with a track record you can check, not just a business card.' WHERE slug = 'professionals';
UPDATE public.forum_categories SET tagline = 'Hire the Plumber Who Actually Shows Up.', description = 'Rated, available, and matched to your job, not a random number off a signboard.' WHERE slug = 'artisans';
UPDATE public.forum_categories SET tagline = 'Buy the Car, Not the Story.', description = 'Real mileage, real condition, real sellers, matched to what you''re actually looking for.' WHERE slug = 'automotive';

UPDATE public.forum_categories SET tagline = 'Every Business Service You Need, Vetted Once, Used Often.', description = 'From your first contract to your tenth vendor: hire people who''ve done it before.' WHERE slug = 'professional-business-services';
UPDATE public.forum_categories SET tagline = 'Get the Paperwork Right the First Time.', description = 'Lawyers, tax accountants, and registration agents who know Nigerian compliance cold.' WHERE slug = 'corporate-legal';
UPDATE public.forum_categories SET tagline = 'Your Next Hire Could Be Your Best Hire.', description = 'Vetted developers, designers, and marketers, matched to the brief, not just a portfolio scroll.' WHERE slug = 'tech-digital-services';
UPDATE public.forum_categories SET tagline = 'Skip the Middleman Markup.', description = 'Retailers matched directly with distributors and wholesalers who actually stock what you need.' WHERE slug = 'b2b-procurement';

UPDATE public.forum_categories SET tagline = 'Learning Matched to the Person, Not a Classroom of 40.', description = 'Tutors, exam prep, and apprenticeships, matched to where you''re starting from.' WHERE slug = 'education-tutoring-skill-exchange';
UPDATE public.forum_categories SET tagline = 'JAMB, WAEC, or Just Catching Up.', description = 'Matched to a tutor who gets results.' WHERE slug = 'private-special-education';
UPDATE public.forum_categories SET tagline = 'A Real Trade, a Real Apprenticeship.', description = 'A real path to earning, matched to the trade you actually want.' WHERE slug = 'vocational-training';

UPDATE public.forum_categories SET tagline = 'Nothing Idle. Nothing Empty. Nothing Wasted.', description = 'Match empty trucks to waiting cargo, and idle equipment to the job that needs it.' WHERE slug = 'logistics-haulage-equipment-rental';
UPDATE public.forum_categories SET tagline = 'That Truck Heading Back Empty?', description = 'Someone''s cargo is waiting for exactly that route.' WHERE slug = 'interstate-haulage-freight';
UPDATE public.forum_categories SET tagline = 'Rent the Excavator for the Job, Not the Year.', description = 'Heavy machinery and industrial equipment, matched to the job length you actually need.' WHERE slug = 'heavy-machinery-asset-leasing';
UPDATE public.forum_categories SET tagline = 'From Farm to Buyer, Matched.', description = 'Tractors, cold storage, and bulk buyers who are actually ready.' WHERE slug = 'agricultural-logistics';

UPDATE public.forum_categories SET tagline = 'Every Vendor Your Event Needs, Matched at Once.', description = 'Photographers, caterers, DJs, and decor, matched to your date, budget, and guest count.' WHERE slug = 'events-hospitality-entertainment';
UPDATE public.forum_categories SET tagline = 'Stop Chasing Five Vendors on Five Different Apps.', description = 'Photographers, caterers, DJs, hall rentals, decor, and security, matched in one place.' WHERE slug = 'event-ecosystem';
UPDATE public.forum_categories SET tagline = 'A Private Chef, a Local Guide, an Experience Worth the Trip.', description = 'Tour guides and private chefs, matched to where you''re headed.' WHERE slug = 'experience-hosts';

UPDATE public.forum_categories SET tagline = 'Care That Comes to You, Vetted Before It Arrives.', description = 'Nurses, physiotherapists, and trainers, matched, checked, and ready when you are.' WHERE slug = 'health-wellness-home-care';
UPDATE public.forum_categories SET tagline = 'Home Care You''d Actually Trust.', description = 'Private nursing and elder care from people vetted before they ever reach your door.' WHERE slug = 'in-home-healthcare';
UPDATE public.forum_categories SET tagline = 'A Plan Matched to Your Goals, Not a Generic One.', description = 'Personal trainers, dietitians, and wellness coaches, matched to what you''re actually working toward.' WHERE slug = 'fitness-lifestyle';


-- ============================================================
-- SOURCE: 20260731000007_group_real_estate_housing.sql
-- ============================================================

-- ============================================================================
-- Group Real Estate & Housing
-- Real Estate, Rentals, Student Hostels, Hotels, and Professionals were the
-- original 5 standalone forum categories, seeded before the parent/child
-- pattern existed. This brings them into that same pattern, matching
-- Professional & Business Services, Education, Logistics, Events, and
-- Health & Wellness. Additive only, ssrRenderer.js / ForumPage.jsx /
-- sitemapService.js all read parent_id generically already, so no code
-- changes are required for this to take effect.
--
-- NOTE: this groups the forum taxonomy only. The underlying listings data
-- for these 5 verticals still lives on separate tables (properties,
-- student_hostels, professionals, etc.), not the unified category_listings
-- table the newer categories use. That data unification is a separate,
-- larger decision (ADR-002 follow-up) and is not made by this migration.
-- ============================================================================

INSERT INTO public.forum_categories (slug, name, tagline, description, sort_order) VALUES
('real-estate-housing', 'Real Estate & Housing', 'Every Way to Own, Rent, or Book a Place.', 'From buying a home to booking a shortlet, all matched and verified in one place.', 5)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'real-estate-housing'),
    sort_order = 1
WHERE slug = 'real-estate';

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'real-estate-housing'),
    sort_order = 2
WHERE slug = 'rentals';

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'real-estate-housing'),
    sort_order = 3
WHERE slug = 'student-hostels';

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'real-estate-housing'),
    sort_order = 4
WHERE slug = 'hotels';

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'real-estate-housing'),
    sort_order = 5
WHERE slug = 'professionals';


-- ============================================================
-- SOURCE: 20260731000008_universal_search.sql
-- ============================================================

-- ============================================================================
-- Universal Search (ADR-012)
-- One database function federating search across category_listings (all new
-- categories) and the legacy tables (properties, student_hostels,
-- professionals) that ADR-002's migration hasn't unified yet. Additive only:
-- adds generated, indexed search columns to the legacy tables (same pattern
-- already used on forum_threads), does not modify existing columns or data.
-- ============================================================================

-- ── Indexed search columns on legacy tables ─────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_properties_search ON public.properties USING GIN(search_vector);

ALTER TABLE public.student_hostels
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_student_hostels_search ON public.student_hostels USING GIN(search_vector);

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(company_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_professionals_search ON public.professionals USING GIN(search_vector);

-- ── Federating search function ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.universal_search(p_query TEXT, p_limit INT DEFAULT 30)
RETURNS TABLE (
  source TEXT,
  item_id TEXT,
  category_slug TEXT,
  category_name TEXT,
  title TEXT,
  snippet TEXT,
  price_cents BIGINT,
  location_name TEXT,
  url_path TEXT,
  created_at TIMESTAMPTZ,
  search_rank REAL
)
LANGUAGE sql STABLE
AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_query) AS tsq)
  SELECT * FROM (
    -- New, schema-driven categories
    SELECT
      'category_listings' AS source,
      cl.id::text AS item_id,
      c.slug AS category_slug,
      c.name AS category_name,
      cl.title,
      left(coalesce(cl.description, ''), 200) AS snippet,
      cl.price_cents,
      cl.location_name,
      '/marketplace/' || c.slug || '/listing/' || cl.id::text AS url_path,
      cl.created_at,
      ts_rank(
        setweight(to_tsvector('english', cl.title), 'A') ||
        setweight(to_tsvector('english', coalesce(cl.description, '')), 'B'),
        (SELECT tsq FROM q)
      ) AS search_rank
    FROM public.category_listings cl
    JOIN public.categories c ON c.id = cl.category_id
    WHERE cl.status = 'ACTIVE'
      AND (SELECT tsq FROM q) @@ (
        setweight(to_tsvector('english', cl.title), 'A') ||
        setweight(to_tsvector('english', coalesce(cl.description, '')), 'B')
      )

    UNION ALL

    -- Real estate (sale, rent, and shortlet variants live on one legacy table)
    SELECT
      'properties',
      p.id::text,
      'real-estate-housing',
      'Real Estate & Housing',
      p.title,
      left(coalesce(p.description, ''), 200),
      (p.price * 100)::bigint,
      p.city || ', ' || p.state,
      '/property/' || p.id::text,
      p.created_at,
      ts_rank(p.search_vector, (SELECT tsq FROM q))
    FROM public.properties p
    WHERE p.status = 'active'
      AND (SELECT tsq FROM q) @@ p.search_vector

    UNION ALL

    -- Student hostels
    SELECT
      'student_hostels',
      sh.id::text,
      'student-hostels',
      'Student Hostels',
      sh.title,
      left(coalesce(sh.description, ''), 200),
      (sh.price_per_year * 100)::bigint,
      sh.city || ', ' || sh.state,
      '/student-hostels/' || sh.id::text,
      sh.created_at,
      ts_rank(sh.search_vector, (SELECT tsq FROM q))
    FROM public.student_hostels sh
    WHERE sh.status = 'active'
      AND (SELECT tsq FROM q) @@ sh.search_vector

    UNION ALL

    -- Real estate professionals directory
    SELECT
      'professionals',
      pr.id::text,
      'professionals',
      'Real Estate Professionals',
      pr.full_name || coalesce(', ' || pr.company_name, ''),
      left(coalesce(pr.bio, ''), 200),
      NULL::bigint,
      pr.coverage_areas,
      '/professionals/' || pr.id::text,
      pr.created_at,
      ts_rank(pr.search_vector, (SELECT tsq FROM q))
    FROM public.professionals pr
    WHERE pr.is_active = true
      AND (SELECT tsq FROM q) @@ pr.search_vector
  ) combined
  ORDER BY search_rank DESC, created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.universal_search IS
  'Federated search across category_listings and legacy verticals (ADR-012). '
  'Called via supabase.rpc(''universal_search'', {...}) from src/modules/search/searchService.js. '
  'Extend this function, not the calling code, when ADR-002''s migration unifies the legacy tables.';


-- ============================================================
-- SOURCE: 20260731000009_taxonomy_corrections_catalog.sql
-- ============================================================

-- ============================================================================
-- ADR-007: Taxonomy Corrections (dynamic catalog / categories table)
-- Merges Heavy Machinery into a new Automotive & Machinery group, broadens
-- Artisans into a Skills, Trades & Daily Services group, renames Logistics.
-- Additive only: existing rows are re-parented and renamed, never deleted,
-- so no category_id foreign key ever breaks.
-- ============================================================================

-- ── Automotive & Machinery ──────────────────────────────────────────────────
INSERT INTO public.categories (slug, name, attribute_schema, intent_filter) VALUES
('automotive-machinery', 'Automotive & Machinery', '{}'::jsonb, NULL)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'automotive-machinery')
WHERE slug = 'automotive';

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'automotive-machinery')
WHERE slug = 'heavy-machinery-asset-leasing';

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'auto-services-parts', 'Auto Services & Parts', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["MECHANIC", "PANEL_BEATER", "TYRE_SERVICE", "CAR_WASH", "PARTS_DEALER", "TOWING"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "mobile_service": { "type": "boolean" }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'automotive-machinery'
ON CONFLICT (slug) DO NOTHING;

-- ── Skills, Trades & Daily Services (broadens Artisans, does not replace it) ─
INSERT INTO public.categories (slug, name, attribute_schema, intent_filter) VALUES
('skills-trades-daily-services', 'Skills, Trades & Daily Services', '{}'::jsonb, NULL)
ON CONFLICT (slug) DO NOTHING;

-- Artisans keeps its slug and existing schema (avoids invalidating anything
-- already built against it), just moves under the broader group.
UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'skills-trades-daily-services')
WHERE slug = 'artisans';

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'cleaning-moving-facility', 'Cleaning, Moving & Facility', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["HOME_CLEANING", "OFFICE_CLEANING", "MOVING_HAULAGE", "FACILITY_MANAGEMENT", "FUMIGATION"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "certificate_optional": { "type": "boolean", "default": true }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'beauty-grooming-personal-care', 'Beauty, Grooming & Personal Care', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["HAIRSTYLIST", "BARBER", "MAKEUP_ARTIST", "NAIL_TECH", "MASSAGE_THERAPIST", "SPA"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "mobile_service": { "type": "boolean" }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'cooking-catering-domestic', 'Cooking, Catering & Domestic', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["PRIVATE_CHEF", "CATERER", "HOUSEKEEPER", "NANNY", "LAUNDRY"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "live_in_available": { "type": "boolean" }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'creative-practical-skills', 'Creative & Practical Skills', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "skill_type": { "type": "string" },
    "years_experience": { "type": "integer", "minimum": 0 },
    "certificate_optional": { "type": "boolean", "default": true },
    "portfolio_url": { "type": "string" }
  },
  "required": ["skill_type"]
}'::jsonb
FROM public.categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

-- ── Rename Logistics group (slug unchanged, FK-safe) ────────────────────────
UPDATE public.categories
SET name = 'Logistics & Mobility'
WHERE slug = 'logistics-haulage-equipment-rental';


-- ============================================================
-- SOURCE: 20260731000010_taxonomy_corrections_forum.sql
-- ============================================================

-- ============================================================================
-- ADR-007: Taxonomy Corrections (forum_categories): mirrors the catalog
-- migration, plus the Events/Real Estate shortlet-hosting fix.
-- ============================================================================

INSERT INTO public.forum_categories (slug, name, tagline, description, sort_order) VALUES
('automotive-machinery', 'Automotive & Machinery', 'Every Way to Buy, Sell, or Fix What Moves.', 'Cars, heavy machinery, and the services that keep them running.', 61)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'automotive-machinery')
WHERE slug = 'automotive';

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'automotive-machinery')
WHERE slug = 'heavy-machinery-asset-leasing';

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'auto-services-parts', 'Auto Services & Parts', 'Mechanics, panel beaters, tyre services, and parts dealers.', 3, id
FROM public.forum_categories WHERE slug = 'automotive-machinery'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, tagline, description, sort_order) VALUES
('skills-trades-daily-services', 'Skills, Trades & Daily Services', 'Every Proven Skill, Certificate Optional.', 'Home repairs, cleaning, beauty, cooking, and any daily skill you can prove.', 62)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'skills-trades-daily-services')
WHERE slug = 'artisans';

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'cleaning-moving-facility', 'Cleaning, Moving & Facility', 'Home and office cleaning, moving, and facility management.', 2, id
FROM public.forum_categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'beauty-grooming-personal-care', 'Beauty, Grooming & Personal Care', 'Hairstylists, barbers, makeup artists, and spa services.', 3, id
FROM public.forum_categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'cooking-catering-domestic', 'Cooking, Catering & Domestic', 'Private chefs, caterers, and domestic help.', 4, id
FROM public.forum_categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'creative-practical-skills', 'Creative & Practical Skills', 'Any proven daily skill, certificate optional.', 5, id
FROM public.forum_categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

UPDATE public.forum_categories
SET name = 'Logistics & Mobility'
WHERE slug = 'logistics-haulage-equipment-rental';

-- ── Shortlet lodging moves from Events to Real Estate & Housing; Events gains
--    Photography/Videography/Content per the Blueprint ────────────────────
UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'real-estate-housing'),
    name = 'Experience Hosts',
    description = 'Tour guides and private chefs (short-stay lodging lives under Hotels & Shortlets).'
WHERE slug = 'experience-hosts';

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'photography-videography-content', 'Photography, Videography & Content', 'Event photographers, videographers, and content creators.', 2, id
FROM public.forum_categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- SOURCE: 20260731000011_fix_match_listings_latlng.sql
-- ============================================================

-- ============================================================================
-- Fix: match_category_listings returned `location` as a raw PostGIS
-- geography column (RETURNS SETOF category_listings). Whether that
-- serializes to parseable GeoJSON depends on PostgREST/Supabase-js
-- configuration and was never actually verified against a live database.
-- A map component built on `listing.location.coordinates` would have been
-- built on an unverified assumption. This replaces the function with an
-- explicit RETURNS TABLE that computes `lat`/`lng` as plain floats via
-- ST_Y/ST_X, so callers never have to parse a geography value at all.
-- ============================================================================

DROP FUNCTION IF EXISTS match_category_listings(INT, VARCHAR, DOUBLE PRECISION, DOUBLE PRECISION, INT, JSONB, INT);

CREATE OR REPLACE FUNCTION match_category_listings(
  p_category_id INT,
  p_type VARCHAR,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_m INT DEFAULT 10000,
  p_attribute_filter JSONB DEFAULT '{}'::jsonb,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id INT,
  type VARCHAR,
  title VARCHAR,
  description TEXT,
  price_cents BIGINT,
  status VARCHAR,
  location_name VARCHAR,
  attributes JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    cl.id, cl.user_id, cl.category_id, cl.type, cl.title, cl.description,
    cl.price_cents, cl.status, cl.location_name, cl.attributes,
    cl.created_at, cl.updated_at,
    CASE WHEN cl.location IS NOT NULL THEN ST_Y(cl.location::geometry) END AS lat,
    CASE WHEN cl.location IS NOT NULL THEN ST_X(cl.location::geometry) END AS lng
  FROM public.category_listings cl
  WHERE cl.category_id = p_category_id
    AND cl.type = p_type
    AND cl.status = 'ACTIVE'
    AND (
      p_lat IS NULL OR p_lng IS NULL OR cl.location IS NULL
      OR ST_DWithin(cl.location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
    )
    AND cl.attributes @> p_attribute_filter
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND cl.location IS NOT NULL
      THEN cl.location <-> ST_MakePoint(p_lng, p_lat)::geography
      ELSE NULL
    END NULLS LAST,
    cl.created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION match_category_listings IS
  'Combines JSONB attribute containment with PostGIS radius search, and returns '
  'explicit lat/lng float columns (not a raw geography value) so consumers, '
  'including the marketplace map, never need to parse PostGIS output. '
  'Called via supabase.rpc(''match_category_listings'', {...}) from api/platform.js (resource=category-match).';

-- Single-listing equivalent, same fix, used by the listing-detail resource so
-- getListing() doesn't inherit the same raw-geography ambiguity that
-- match_category_listings had before this migration.
CREATE OR REPLACE FUNCTION get_listing_with_latlng(p_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id INT,
  type VARCHAR,
  title VARCHAR,
  description TEXT,
  price_cents BIGINT,
  status VARCHAR,
  location_name VARCHAR,
  attributes JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    cl.id, cl.user_id, cl.category_id, cl.type, cl.title, cl.description,
    cl.price_cents, cl.status, cl.location_name, cl.attributes,
    cl.created_at, cl.updated_at,
    CASE WHEN cl.location IS NOT NULL THEN ST_Y(cl.location::geometry) END AS lat,
    CASE WHEN cl.location IS NOT NULL THEN ST_X(cl.location::geometry) END AS lng
  FROM public.category_listings cl
  WHERE cl.id = p_id;
$$;

COMMENT ON FUNCTION get_listing_with_latlng IS
  'Single-row lookup for category_listings with explicit lat/lng, replacing the '
  'plain .from(category_listings).select(*) previously used by getListing() in '
  'listingsService.js, which returned an unparsed geography value for location.';

