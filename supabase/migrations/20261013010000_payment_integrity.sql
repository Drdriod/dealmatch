-- ============================================================================
-- Payment integrity (October 2026).
--
-- Every paid state in DealMatch is now written only by the server, after the
-- payment is confirmed, and every amount is worked out from the database
-- (platform_fees and the listing or booking row), never from the browser.
--
-- This migration closes the database side of that:
--   1. Bookings can no longer be inserted by a client. A hotel booking is
--      created by the server together with its payment request, and is
--      confirmed only by the webhook.
--   2. Hostel payment rows can no longer be inserted by a client. The server
--      writes them with the registry price for the plan.
--   3. A listing owner can no longer set listing_paid / payment_ref on their
--      own hostel, and a user can no longer set professional status or
--      subscription fields on their own application.
--   4. A tenant or buyer can no longer change the money columns of an escrow.
--   5. start_property_escrow_payment takes the amount from the listing. A
--      client can no longer name a different gross amount, and cannot buy from
--      their own listing.
--
-- Trigger guards let the server (service role, auth.uid() IS NULL), staff, and
-- any nested trigger work (pg_trigger_depth() > 1, e.g. the escrow release
-- that runs when a tenant confirms move-in) through.
-- ============================================================================

-- 1. Bookings: no direct client inserts ---------------------------------------
DROP POLICY IF EXISTS "Auth users can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON public.bookings;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS platform_fee_ngn numeric;

-- 2. Hostel payments: server-only inserts --------------------------------------
DROP POLICY IF EXISTS "Owner inserts hostel payment" ON public.hostel_payments;

-- 3a. Shared bypass: the server, staff, or a nested trigger ---------------------
CREATE OR REPLACE FUNCTION public.fn_payment_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NULL
      OR public.is_staff()
      OR public.is_superadmin()
      OR pg_trigger_depth() > 1;
$$;

-- 3b. Hostel listing paid fields ----------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_hostel_paid_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fn_payment_bypass() THEN
    RETURN NEW;
  END IF;
  IF NEW.listing_paid    IS DISTINCT FROM OLD.listing_paid
  OR NEW.listing_paid_at IS DISTINCT FROM OLD.listing_paid_at
  OR NEW.payment_ref     IS DISTINCT FROM OLD.payment_ref THEN
    RAISE EXCEPTION 'Listing payment status can only be set by a confirmed payment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_hostel_paid_fields ON public.student_hostels;
CREATE TRIGGER trg_guard_hostel_paid_fields
  BEFORE UPDATE ON public.student_hostels
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_hostel_paid_fields();

-- 3c. Professional billing fields ---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_professional_billing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fn_payment_bypass() THEN
    RETURN NEW;
  END IF;
  IF NEW.status              IS DISTINCT FROM OLD.status
  OR NEW.subscription_plan   IS DISTINCT FROM OLD.subscription_plan
  OR NEW.subscription_start  IS DISTINCT FROM OLD.subscription_start
  OR NEW.subscription_expiry IS DISTINCT FROM OLD.subscription_expiry
  OR NEW.activated_at        IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'Subscription and approval status can only be changed by DealMatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_professional_billing ON public.professional_applications;
CREATE TRIGGER trg_guard_professional_billing
  BEFORE UPDATE ON public.professional_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_professional_billing();

-- 4. Escrow money columns ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_escrow_money()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fn_payment_bypass() THEN
    RETURN NEW;
  END IF;
  IF NEW.gross_amount        IS DISTINCT FROM OLD.gross_amount
  OR NEW.platform_pct        IS DISTINCT FROM OLD.platform_pct
  OR NEW.platform_amount     IS DISTINCT FROM OLD.platform_amount
  OR NEW.fee_from_tenant     IS DISTINCT FROM OLD.fee_from_tenant
  OR NEW.fee_from_landlord   IS DISTINCT FROM OLD.fee_from_landlord
  OR NEW.landlord_receives   IS DISTINCT FROM OLD.landlord_receives
  OR NEW.agent_payout        IS DISTINCT FROM OLD.agent_payout
  OR NEW.referral_payout     IS DISTINCT FROM OLD.referral_payout
  OR NEW.payout_locked       IS DISTINCT FROM OLD.payout_locked
  OR NEW.payout_processed_at IS DISTINCT FROM OLD.payout_processed_at
  OR NEW.payment_ref         IS DISTINCT FROM OLD.payment_ref
  OR NEW.property_id         IS DISTINCT FROM OLD.property_id
  OR NEW.buyer_id           IS DISTINCT FROM OLD.buyer_id
  OR NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
  OR NEW.seller_id           IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'Escrow amounts and parties cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_escrow_money ON public.escrow_transactions;
CREATE TRIGGER trg_guard_escrow_money
  BEFORE UPDATE ON public.escrow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_escrow_money();

-- 5. Escrow start: the amount is the listed price, and no self-purchase -------
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
  v_listed_price  NUMERIC;
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

  SELECT seller_id, price INTO v_seller_id, v_listed_price
    FROM public.properties WHERE id = p_property_id;
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'property % not found', p_property_id;
  END IF;
  IF v_seller_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot pay for your own listing';
  END IF;
  -- The amount is the listed price. The browser cannot name another amount.
  IF v_listed_price IS NULL OR p_gross_amount <> v_listed_price THEN
    RAISE EXCEPTION 'The amount must equal the listed price';
  END IF;

  -- The rate comes from the platform fee registry, not from code.
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
