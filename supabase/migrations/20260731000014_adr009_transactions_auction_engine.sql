-- ============================================================================
-- ADR-009: Phased auction engine -- Nearest-Available first, then
-- Multi-Attribute Reverse, then Timed English; Dutch and Sealed deferred.
--
-- One `transactions` table with a `model` discriminator column from day
-- one, even though only NEAREST_AVAILABLE and MULTI_ATTRIBUTE_REVERSE have
-- application logic behind them at this migration. Adding Dutch/Sealed
-- later is a new state handler against this same table, not a new table.
--
-- Also carries ADR-004.3's financial record-keeping requirement:
-- commission_rate_applied and commission_amount_cents are captured once at
-- settlement time, never computed retroactively from a rate that might
-- change later. The rates/policy themselves are a separate business
-- decision still pending -- this migration only makes sure the column
-- exists and is write-once, not what the number should be.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.auction_model AS ENUM (
    'NEAREST_AVAILABLE',
    'MULTI_ATTRIBUTE_REVERSE',
    'TIMED_ENGLISH',
    'DUTCH',
    'SEALED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_status AS ENUM (
    'OPEN',        -- accepting bids / awaiting accept-decline
    'PENDING',     -- winner selected, escrow not yet funded
    'FUNDED',      -- escrow funded, work/handover in progress
    'COMPLETED',   -- settled, commission captured, immutable from here
    'DISPUTED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.transactions (
  id                        BIGSERIAL PRIMARY KEY,
  model                     public.auction_model NOT NULL,
  status                    public.transaction_status NOT NULL DEFAULT 'OPEN',
  category_id               INT REFERENCES public.categories(id),
  listing_id                BIGINT,               -- category_listings.id, nullable: legacy-vertical
  listing_source            TEXT,                 -- mirrors universal_match()'s `source` (ADR-002)
  requester_id              UUID NOT NULL REFERENCES auth.users(id),
  provider_id               UUID REFERENCES auth.users(id),   -- NULL until a winner is picked
  amount_cents              BIGINT,                -- final agreed price, NULL while still bidding
  currency                  VARCHAR(3) NOT NULL DEFAULT 'NGN',

  -- Financial record-keeping (Architecture v3, Section 4.3): written once
  -- at settlement, never recomputed from a rate that might change later.
  commission_rate_applied   NUMERIC(5,4),          -- e.g. 0.1500 for 15%, captured at settlement
  commission_amount_cents   BIGINT,

  attributes                JSONB NOT NULL DEFAULT '{}'::jsonb,  -- model-specific state (e.g. reverse-bid criteria weights, auction end time)
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_requester ON public.transactions(requester_id);
CREATE INDEX IF NOT EXISTS idx_transactions_provider   ON public.transactions(provider_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status     ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_model      ON public.transactions(model);
CREATE INDEX IF NOT EXISTS idx_transactions_category   ON public.transactions(category_id);

COMMENT ON TABLE public.transactions IS
  'ADR-009: single state-machine table for all five auction models via the '
  '`model` discriminator. Only NEAREST_AVAILABLE and MULTI_ATTRIBUTE_REVERSE '
  'have application-layer handlers as of this migration; TIMED_ENGLISH, '
  'DUTCH, SEALED are schema-ready but deliberately unimplemented (see ADR-009 '
  'build order). Do not build UI or API routes against those three without '
  'a corresponding state-handler decision first.';

COMMENT ON COLUMN public.transactions.commission_rate_applied IS
  'Captured once at settlement (status -> COMPLETED). Never recomputed '
  'retroactively -- if the platform commission rate changes later, existing '
  'rows keep the rate that was actually applied at the time.';

-- Bids: one row per bid/offer against a transaction. Nearest-Available uses
-- this with a single accept/decline row per invited provider (no ranking);
-- Multi-Attribute Reverse uses it for the full bid set the requester picks
-- from.
CREATE TABLE IF NOT EXISTS public.bids (
  id               BIGSERIAL PRIMARY KEY,
  transaction_id   BIGINT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  provider_id      UUID NOT NULL REFERENCES auth.users(id),
  amount_cents     BIGINT,
  attributes       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- e.g. {"eta_minutes": 30, "warranty_days": 90} for multi-attribute comparison
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','WITHDRAWN')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_bids_transaction ON public.bids(transaction_id);
CREATE INDEX IF NOT EXISTS idx_bids_provider     ON public.bids(provider_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_select_participant ON public.transactions;
CREATE POLICY transactions_select_participant ON public.transactions
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = provider_id);

DROP POLICY IF EXISTS transactions_insert_requester ON public.transactions;
CREATE POLICY transactions_insert_requester ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- No direct client UPDATE policy: status transitions (OPEN -> PENDING ->
-- FUNDED -> COMPLETED) and commission capture must go through a controlled
-- RPC/API route, not a raw client PATCH, same reasoning as
-- verified_providers' no-client-write policy in ADR-008's migration.

DROP POLICY IF EXISTS bids_select_participant ON public.bids;
CREATE POLICY bids_select_participant ON public.bids
  FOR SELECT USING (
    auth.uid() = provider_id
    OR auth.uid() = (SELECT requester_id FROM public.transactions t WHERE t.id = transaction_id)
  );

DROP POLICY IF EXISTS bids_insert_provider ON public.bids;
CREATE POLICY bids_insert_provider ON public.bids
  FOR INSERT WITH CHECK (auth.uid() = provider_id);

-- Guardrail matching the fitness-function candidate from Architecture v3
-- Section 8: commission fields, once set, cannot be altered by application
-- code -- only settlement (OPEN status change into COMPLETED) may write
-- them, and never again after that.
CREATE OR REPLACE FUNCTION public.prevent_commission_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'COMPLETED' AND (
    NEW.commission_rate_applied IS DISTINCT FROM OLD.commission_rate_applied
    OR NEW.commission_amount_cents IS DISTINCT FROM OLD.commission_amount_cents
  ) THEN
    RAISE EXCEPTION 'commission fields are immutable once a transaction is COMPLETED (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_commission_mutation ON public.transactions;
CREATE TRIGGER trg_prevent_commission_mutation
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_commission_mutation();
