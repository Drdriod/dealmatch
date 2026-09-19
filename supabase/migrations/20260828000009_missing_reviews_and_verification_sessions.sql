-- ============================================================================
-- Two tables that were referenced everywhere but never actually created.
-- Found by systematically cross-checking every .from()/.rpc() call in the
-- whole codebase against what CREATE TABLE/FUNCTION statements actually
-- exist across all migrations, rather than testing page by page.
--
-- 1) public.reviews - queried directly by ProviderProfilePage.jsx for a
--    provider's rating list, and ALSO referenced inside the provider_stats
--    VIEW's own definition (20260731000017). That view's CREATE VIEW
--    statement would have failed outright when it was first run, since
--    "FROM public.reviews" can't succeed against a table that doesn't
--    exist. If that migration was applied by pasting the whole file into
--    the SQL editor as one script (a normal way to run these), a mid-script
--    failure rolls back everything in that same paste - including
--    accept_bid() and counter_bid(), defined further down in the exact
--    same file. That would mean the entire "Let providers bid" flow's
--    Accept/Counter actions have had nothing behind them this whole time.
--
-- 2) public.verification_sessions - the agent GPS/photo property
--    verification workflow (api/agent/[action].js: HMAC-signed telemetry,
--    mock-location detection, GPS variance checks against the property
--    address) reads and writes this table at almost every step, and it
--    was never created anywhere. Every session-creation call would fail
--    with "relation does not exist" - the entire agent verification
--    feature has had no backing table.
--
-- This migration creates both tables, then re-applies (CREATE OR REPLACE,
-- so safe regardless of whether they already exist) the view and two
-- functions that depend on public.reviews, copied verbatim from
-- 20260731000017 so nothing about their logic changes here - only that
-- they can now actually succeed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- property-images: referenced by RLS policies (bucket_id = 'property-images')
-- and by upload code, but unlike identity-docs/provider-portfolio/avatars
-- (20260828000005), no explicit storage.buckets INSERT for it was ever
-- found in any migration. That doesn't necessarily mean it's missing live -
-- buckets can be created through the Supabase dashboard with no SQL trace
-- at all, which is a very normal way for an earlier one to have been set
-- up. This is a defensive guarantee, not a confirmed fix: ON CONFLICT DO
-- NOTHING means it only creates the bucket if it's genuinely absent, and
-- otherwise leaves whatever public/private setting is already live
-- untouched rather than silently overriding it.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id  UUID NOT NULL REFERENCES auth.users(id),
  rating       NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_provider ON public.reviews(provider_id);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Reviews are shown on public provider profiles - readable by anyone,
-- same as property_reviews' existing pattern.
CREATE POLICY "reviews_public_read" ON public.reviews
  FOR SELECT USING (true);

CREATE POLICY "reviews_self_insert" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "reviews_self_update" ON public.reviews
  FOR UPDATE USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "reviews_self_delete" ON public.reviews
  FOR DELETE USING (auth.uid() = reviewer_id);

-- ---------------------------------------------------------------------------
-- verification_sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.verification_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES auth.users(id),
  property_id      UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  platform         TEXT,
  server_t0        TIMESTAMPTZ NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'consumed', 'expired', 'rejected')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_agent ON public.verification_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_verification_sessions_property ON public.verification_sessions(property_id);

ALTER TABLE public.verification_sessions ENABLE ROW LEVEL SECURITY;

-- api/agent/[action].js exclusively uses the service-role client for this
-- table (getServiceClient(), bypasses RLS as table owner) - these policies
-- exist only as a backstop in case a future code path queries it with a
-- user-scoped client instead.
CREATE POLICY "verification_sessions_agent_own" ON public.verification_sessions
  FOR SELECT USING (auth.uid() = agent_id);

-- ---------------------------------------------------------------------------
-- Re-apply provider_stats, accept_bid, counter_bid now that public.reviews
-- actually exists. Copied verbatim from 20260731000017 - CREATE OR REPLACE
-- throughout, so this is a no-op if they already somehow exist correctly,
-- and a real fix if they don't.
-- ---------------------------------------------------------------------------

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
