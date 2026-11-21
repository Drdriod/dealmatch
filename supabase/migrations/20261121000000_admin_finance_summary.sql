-- Financial dashboard: one read-only function that returns the numbers the admin Finance tab shows,
-- each with a stated calculation (see the tab's "How this is calculated" notes).
--
-- Rules it follows:
--  * Customer money held for others (rent, sale price, room charge, job price) is NOT revenue.
--  * Revenue = DealMatch's own fees only, excluding VAT (VAT belongs to the tax authority).
--  * Escrow fees are reported as "held" until the escrow is released, not as earned.
--  * Costs that are not recorded (gateway fees, operating expenses) come back as null, never as 0,
--    so the screen can say "not recorded" instead of inventing a profit.
--  * Tax figures are returned only to accounts that can read tax (owner and added accountants).
CREATE OR REPLACE FUNCTION public.admin_finance_summary(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r jsonb;
  v_flat bigint; v_hotel_fee bigint; v_hotel_gmv bigint; v_escrow_gmv bigint; v_escrow_held bigint;
  v_job_gmv bigint; v_job_comm bigint; v_jobs int;
  v_ref_pending bigint; v_ref_released bigint; v_ref_credits int; v_ref_review int;
  v_vat bigint; v_vat_owed bigint; v_wht_owed bigint;
  v_refund_amt bigint; v_refund_n int; v_pay_pending bigint; v_pay_failed int; v_disputes int;
  v_unfulfilled int; v_underpaid int; v_new_users int; v_verified int; v_by_type jsonb;
  v_revenue bigint; v_ref_cost bigint;
BEGIN
  IF NOT (public.is_admin() OR public.is_superadmin()) THEN
    RAISE EXCEPTION 'only an administrator can view finance' USING ERRCODE = '42501';
  END IF;

  WITH paid AS (
    SELECT va.reference, va.metadata->>'type' AS typ,
           (va.expected_kobo - COALESCE(NULLIF(va.metadata->>'vat_kobo','')::bigint, 0)) AS price_kobo,
           COALESCE(NULLIF(va.metadata->>'vat_kobo','')::bigint, 0) AS vat_kobo,
           COALESCE(NULLIF(va.metadata->>'platform_fee_ngn','')::numeric, 0) AS hotel_fee_ngn
      FROM public.payment_virtual_accounts va
     WHERE va.status = 'paid' AND va.paid_at >= p_from AND va.paid_at < p_to
       AND COALESCE(va.metadata->>'type','') <> 'payment_test'
  )
  SELECT
    COALESCE(sum(price_kobo) FILTER (WHERE typ IN ('professional_subscription','hostel_listing_fee','contact_unlock_credits')), 0),
    COALESCE(sum(round(hotel_fee_ngn * 100)) FILTER (WHERE typ = 'hotel_booking'), 0)::bigint,
    COALESCE(sum(price_kobo - round(hotel_fee_ngn * 100)) FILTER (WHERE typ = 'hotel_booking'), 0)::bigint,
    COALESCE(sum(price_kobo) FILTER (WHERE typ = 'escrow_payment'), 0),
    COALESCE(sum(vat_kobo), 0),
    COALESCE(jsonb_object_agg(typ, t) FILTER (WHERE typ IS NOT NULL), '{}'::jsonb)
  INTO v_flat, v_hotel_fee, v_hotel_gmv, v_escrow_gmv, v_vat, v_by_type
  FROM (
    SELECT typ, jsonb_build_object('count', count(*), 'price_kobo', sum(price_kobo)) AS t, sum(price_kobo) AS price_kobo,
           sum(hotel_fee_ngn) AS hotel_fee_ngn, sum(vat_kobo) AS vat_kobo
      FROM paid GROUP BY typ
  ) x(typ, t, price_kobo, hotel_fee_ngn, vat_kobo);

  -- Escrow fees held: the platform's share of escrows funded in the period, earned only on release.
  SELECT COALESCE(sum(platform_amount), 0) * 100 INTO v_escrow_held
    FROM public.escrow_transactions WHERE status = 'funded' AND funded_at >= p_from AND funded_at < p_to;

  SELECT COALESCE(sum(amount_cents), 0), COALESCE(sum(commission_amount_cents), 0), count(*)
    INTO v_job_gmv, v_job_comm, v_jobs
    FROM public.transactions WHERE status = 'COMPLETED' AND completed_at >= p_from AND completed_at < p_to;

  SELECT COALESCE(sum(referral_earning) FILTER (WHERE status = 'pending'), 0) * 100,
         COALESCE(sum(referral_earning) FILTER (WHERE status IN ('confirmed','paid_out')), 0) * 100,
         COALESCE(sum(points_awarded) FILTER (WHERE payout_type = 'points'), 0),
         count(*) FILTER (WHERE needs_review AND status = 'pending')
    INTO v_ref_pending, v_ref_released, v_ref_credits, v_ref_review
    FROM public.referral_transactions WHERE created_at >= p_from AND created_at < p_to AND status <> 'cancelled';

  SELECT COALESCE(sum(amount_kobo), 0), count(*) INTO v_refund_amt, v_refund_n FROM public.payment_refunds WHERE status = 'to_refund';
  SELECT COALESCE(sum(amount_cents), 0), count(*) FILTER (WHERE status = 'failed')
    INTO v_pay_pending, v_pay_failed FROM public.payout_queue WHERE status IN ('pending','processing','failed');
  SELECT count(*) INTO v_disputes FROM public.disputes WHERE case_state IN ('open','awaiting_response','under_review','escalated');
  SELECT count(*) INTO v_unfulfilled FROM public.payment_virtual_accounts WHERE status = 'paid' AND fulfilled_at IS NULL;
  SELECT count(*) INTO v_underpaid FROM public.payment_virtual_accounts WHERE status = 'underpaid';
  SELECT count(*), count(*) FILTER (WHERE identity_verification_status = 'approved') INTO v_new_users, v_verified
    FROM public.profiles WHERE created_at >= p_from AND created_at < p_to;

  v_revenue := v_flat + v_hotel_fee + v_job_comm;
  v_ref_cost := v_ref_pending + v_ref_released;

  r := jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'gmv_kobo', v_hotel_gmv + v_escrow_gmv + v_job_gmv,
    'gmv_parts', jsonb_build_object('hotel_room_charges', v_hotel_gmv, 'property_escrow', v_escrow_gmv, 'jobs_completed', v_job_gmv),
    'revenue_kobo', v_revenue,
    'revenue_parts', jsonb_build_object('subscriptions_listings_credits', v_flat, 'hotel_booking_fee', v_hotel_fee, 'job_commission', v_job_comm),
    'escrow_fees_held_kobo', v_escrow_held,
    'referral_cost_kobo', v_ref_cost,
    'referral_parts', jsonb_build_object('on_hold', v_ref_pending, 'released', v_ref_released, 'credits_awarded', v_ref_credits),
    'contribution_estimate_kobo', v_revenue - v_ref_cost,
    'gateway_cost_kobo', NULL,
    'operating_cost_kobo', NULL,
    'operating_profit_kobo', NULL,
    'by_type', v_by_type,
    'completed_jobs', v_jobs,
    'control', jsonb_build_object(
      'refunds_to_return_kobo', v_refund_amt, 'refunds_to_return_count', v_refund_n,
      'payouts_pending_kobo', v_pay_pending, 'payouts_failed_count', v_pay_failed,
      'open_disputes', v_disputes, 'paid_not_fulfilled', v_unfulfilled, 'underpaid_accounts', v_underpaid,
      'referrals_awaiting_review', v_ref_review),
    'users', jsonb_build_object('new', v_new_users, 'verified', v_verified)
  );

  IF public.can_read_tax() THEN
    SELECT COALESCE(sum(tax_kobo) FILTER (WHERE kind = 'vat' AND status = 'owed'), 0),
           COALESCE(sum(tax_kobo) FILTER (WHERE kind = 'wht' AND status = 'owed'), 0)
      INTO v_vat_owed, v_wht_owed FROM public.tax_ledger;
    r := r || jsonb_build_object('tax', jsonb_build_object('vat_collected_in_period_kobo', v_vat, 'vat_owed_kobo', v_vat_owed, 'wht_owed_kobo', v_wht_owed));
  ELSE
    r := r || jsonb_build_object('tax', NULL);
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_finance_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_summary(timestamptz, timestamptz) TO authenticated;
