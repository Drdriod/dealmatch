-- ============================================================================
-- Bug fixes found on self-review, not caught before delivery:
--
-- 1. provider_stats (20260731000016) used `RIGHT JOIN LATERAL`, which
--    PostgreSQL does not allow (LATERAL is only valid on CROSS/INNER/LEFT
--    joins). The CREATE VIEW statement would have failed outright -- the
--    view never existed, so ProviderProfilePage's stats query was against
--    a table that was never created. Rewritten below with CTEs and a
--    FULL OUTER JOIN, no LATERAL needed since the subqueries never
--    actually referenced each other.
--
-- 2. JobPostingPage's acceptBid()/counterBid() called
--    supabase.from('bids').update(...) and
--    supabase.from('transactions').update(...) directly from the client.
--    But the migration that created those tables (20260731000014)
--    deliberately left out client UPDATE policies -- the comment there
--    says "must go through a controlled RPC/API route, not a raw client
--    PATCH." RLS defaults to deny with no matching policy, so those calls
--    would have silently failed in production: Accept and Counter buttons
--    that do nothing. Added accept_bid()/counter_bid() RPCs below,
--    SECURITY DEFINER with the authorization check done inside the
--    function instead of via a blanket client policy.
--
-- 3. acceptBid() fired emitEvent('bid.placed', { requesterId, ... }) --
--    but bid.placed is supposed to notify a REQUESTER that a NEW bid
--    arrived from a provider. Firing it at accept-time, targeted at the
--    requester who just clicked Accept themselves, notifies someone of
--    their own action after the fact -- meaningless. There is also no
--    code anywhere that actually submits a bid (no provider-side bidding
--    UI exists yet), so bid.placed currently has no real trigger point.
--    Fixed: removed that call from JobPostingPage, added a correctly
--    targeted bid.accepted event that notifies the PROVIDER whose bid won.
-- ============================================================================

-- ── Fix 1: provider_stats, rewritten without LATERAL ──────────────────────
DROP VIEW IF EXISTS public.provider_stats;

CREATE VIEW public.provider_stats AS
WITH review_agg AS (
  SELECT
    provider_id,
    COUNT(*)                          AS review_count,
    ROUND(AVG(rating)::numeric, 1)    AS avg_rating
  FROM public.reviews
  GROUP BY provider_id
),
tx_agg AS (
  SELECT
    provider_id,
    ROUND(
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::numeric
      / NULLIF(COUNT(*) FILTER (WHERE status IN ('COMPLETED','CANCELLED','DISPUTED')), 0),
      2
    ) AS completion_rate
  FROM public.transactions
  WHERE provider_id IS NOT NULL
  GROUP BY provider_id
)
SELECT
  COALESCE(r.provider_id, t.provider_id) AS provider_id,
  COALESCE(r.review_count, 0)            AS review_count,
  r.avg_rating,
  t.completion_rate
FROM review_agg r
FULL OUTER JOIN tx_agg t ON t.provider_id = r.provider_id;

COMMENT ON VIEW public.provider_stats IS
  'Per-provider aggregates for Provider Profile screen. Rewritten '
  '2026-08-10 to fix an invalid RIGHT JOIN LATERAL in the original '
  '20260731000016 version, which would have failed to create at all.';

-- ── Fix 2: accept_bid / counter_bid RPCs ───────────────────────────────────
-- Both SECURITY DEFINER: bypass the (intentionally absent) client UPDATE
-- policies on bids/transactions, but check authorization explicitly
-- inside the function instead of relying on a broad RLS grant.

CREATE OR REPLACE FUNCTION public.accept_bid(
  p_transaction_id BIGINT,
  p_bid_id BIGINT
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx  public.transactions%ROWTYPE;
  v_bid public.bids%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction % not found', p_transaction_id;
  END IF;
  IF v_tx.requester_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the requester may accept a bid on this transaction';
  END IF;
  IF v_tx.status <> 'OPEN' THEN
    RAISE EXCEPTION 'transaction % is not open (status=%)', p_transaction_id, v_tx.status;
  END IF;

  SELECT * INTO v_bid FROM public.bids WHERE id = p_bid_id AND transaction_id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bid % not found on transaction %', p_bid_id, p_transaction_id;
  END IF;
  IF v_bid.status <> 'PENDING' THEN
    RAISE EXCEPTION 'bid % is not pending (status=%)', p_bid_id, v_bid.status;
  END IF;

  UPDATE public.bids SET status = 'ACCEPTED' WHERE id = p_bid_id;
  UPDATE public.bids SET status = 'DECLINED'
    WHERE transaction_id = p_transaction_id AND id <> p_bid_id AND status = 'PENDING';

  UPDATE public.transactions
  SET provider_id = v_bid.provider_id,
      amount_cents = v_bid.amount_cents,
      status = 'PENDING',
      updated_at = now()
  WHERE id = p_transaction_id
  RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_bid(BIGINT, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.counter_bid(
  p_bid_id BIGINT,
  p_counter_cents BIGINT
) RETURNS public.bids
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid public.bids%ROWTYPE;
  v_tx  public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM public.bids WHERE id = p_bid_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bid % not found', p_bid_id;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = v_bid.transaction_id;
  IF v_tx.requester_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the requester may counter a bid on this transaction';
  END IF;
  IF v_bid.status <> 'PENDING' THEN
    RAISE EXCEPTION 'bid % is not pending (status=%)', p_bid_id, v_bid.status;
  END IF;
  IF p_counter_cents IS NULL OR p_counter_cents <= 0 THEN
    RAISE EXCEPTION 'counter amount must be positive';
  END IF;

  UPDATE public.bids
  SET attributes = attributes || jsonb_build_object('counter_offer_cents', p_counter_cents)
  WHERE id = p_bid_id
  RETURNING * INTO v_bid;

  RETURN v_bid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.counter_bid(BIGINT, BIGINT) TO authenticated;
