-- ============================================================================
-- Fee rate: 1.5% from each side (3% total) on every escrowed deal.
--
-- Sales already charge 1.5% per side in fn_calculate_revenue_split. This
-- migration brings rentals down from 3.75% per side (7.5% total) to the same
-- 1.5% per side, in the two functions that set the rate:
--   * start_property_escrow_payment  (the figure recorded when a payment starts)
--   * fn_calculate_revenue_split     (the split when funds are released)
--
-- Rental split of the fee pool stays 65% platform / 25% agent / 10% referrer,
-- so agent and referrer payouts on rentals shrink in proportion.
--
-- Written as a guarded text replacement on each function's current definition,
-- so it changes only the rental rates and nothing else. It fails loudly if
-- the function no longer contains the expected rate, rather than doing nothing.
-- Escrows already created keep the rate they were recorded with.
-- ============================================================================

DO $$
DECLARE
  v_def  text;
  v_new  text;
BEGIN
  -- 1. start_property_escrow_payment
  SELECT pg_get_functiondef('public.start_property_escrow_payment'::regproc) INTO v_def;
  IF v_def !~ '0\.0375' OR v_def !~ '0\.075' THEN
    RAISE EXCEPTION 'FEE_RATE_UNEXPECTED: start_property_escrow_payment does not contain the 3.75%% / 7.5%% rates';
  END IF;
  v_new := v_def;
  v_new := replace(v_new, 'ROUND(p_gross_amount * 0.0375, 2)', 'ROUND(p_gross_amount * 0.015, 2)');
  v_new := replace(v_new, 'p_gross_amount, 0.075, v_fee_per_party * 2,', 'p_gross_amount, 0.030, v_fee_per_party * 2,');
  v_new := replace(v_new, '-- Same 3.75% + 3.75% = 7.5% total split EscrowPage.jsx already computes', '-- Same 1.5% + 1.5% = 3% total split EscrowPage.jsx computes');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'FEE_RATE_NO_CHANGE: start_property_escrow_payment was not rewritten';
  END IF;
  EXECUTE v_new;

  -- 2. fn_calculate_revenue_split (rental branch only; the sale branch is already 1.5% per side)
  SELECT pg_get_functiondef('public.fn_calculate_revenue_split'::regproc) INTO v_def;
  IF v_def !~ '0\.0375' OR v_def !~ '0\.075' THEN
    RAISE EXCEPTION 'FEE_RATE_UNEXPECTED: fn_calculate_revenue_split does not contain the 3.75%% / 7.5%% rental rates';
  END IF;
  v_new := v_def;
  v_new := replace(v_new, '-- ── RENTAL: 7.5% total (3.75% each side) ──────────────────', '-- ── RENTAL: 3% total (1.5% each side) ──────────────────');
  v_new := replace(v_new, '-- Total fee pool = gross * 0.075', '-- Total fee pool = gross * 0.030');
  v_new := replace(v_new, 'esc.gross_amount * 0.075 * 0.65', 'esc.gross_amount * 0.030 * 0.65');
  v_new := replace(v_new, 'esc.gross_amount * 0.075 * 0.25', 'esc.gross_amount * 0.030 * 0.25');
  v_new := replace(v_new, 'esc.gross_amount * 0.075 * 0.10', 'esc.gross_amount * 0.030 * 0.10');
  v_new := replace(v_new, 'ROUND(esc.gross_amount * 0.0375, 2)', 'ROUND(esc.gross_amount * 0.015, 2)');
  v_new := replace(v_new, 'platform_pct      = 0.075,', 'platform_pct      = 0.030,');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'FEE_RATE_NO_CHANGE: fn_calculate_revenue_split was not rewritten';
  END IF;
  EXECUTE v_new;
END
$$;

-- Check: no rental rate remains in either function.
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('start_property_escrow_payment', 'fn_calculate_revenue_split')
     AND (pg_get_functiondef(p.oid) ~ '0\.0375' OR pg_get_functiondef(p.oid) ~ '0\.075');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'FEE_RATE_STILL_PRESENT: % function(s) still contain a 3.75%% or 7.5%% rate', v_bad;
  END IF;
END
$$;
