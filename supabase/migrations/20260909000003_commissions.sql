-- ============================================================================
-- Commissions: admin-managed, schedulable platform fees. This is the table
-- the original technical brief asked for, built now because Phase 2's
-- "lock the rate at deal creation" has nothing to lock from without it.
--
-- target_category_id (nullable) is the "Category/Audience" column from the
-- brief, pointed at the existing public.categories table rather than a
-- free-text field, so a commission genuinely maps to a real category
-- instead of a typo-prone string. NULL means "all categories", the
-- platform-wide default.
--
-- Scheduling runs on pg_cron (already enabled at the project level, see
-- extensions.grant_pg_cron_access in the baseline schema), not Redis or
-- BullMQ, matching the stack actually in use here.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.commission_status AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.commissions (
  id                 BIGSERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT,
  percentage_rate    NUMERIC(5,2) NOT NULL DEFAULT 0,   -- 5.00 means 5%, matches the brief's stated format
  fixed_fee_cents    BIGINT NOT NULL DEFAULT 0,          -- stored in cents like every other money column in this schema
  target_category_id INT REFERENCES public.categories(id) ON DELETE SET NULL, -- NULL = all categories
  status             public.commission_status NOT NULL DEFAULT 'DRAFT',
  effective_date     TIMESTAMPTZ NOT NULL,
  expiry_date        TIMESTAMPTZ,
  is_default         BOOLEAN NOT NULL DEFAULT false,     -- the global fallback when a category has no dedicated ACTIVE row
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one ACTIVE row per category at a time (NULLS NOT DISTINCT treats
-- "all-categories" rows as one group too), otherwise get_active_commission()
-- below would have no principled way to pick between two active rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commissions_active_per_category
  ON public.commissions (target_category_id)
  NULLS NOT DISTINCT
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_commissions_status_effective ON public.commissions(status, effective_date);
CREATE INDEX IF NOT EXISTS idx_commissions_status_expiry    ON public.commissions(status, expiry_date) WHERE expiry_date IS NOT NULL;

COMMENT ON TABLE public.commissions IS
  'Admin-managed platform fees, schedulable ahead of time. A transaction '
  'snapshots whichever rate is ACTIVE for its category the moment the deal '
  'is created (see accept_bid), it never re-reads this table afterwards.';

DROP TRIGGER IF EXISTS trg_commissions_updated_at ON public.commissions;
CREATE TRIGGER trg_commissions_updated_at
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read ACTIVE commissions (this is the fee shown to users
-- before they commit to a deal), only admins can read/write everything else.
DROP POLICY IF EXISTS commissions_select_active_public ON public.commissions;
CREATE POLICY commissions_select_active_public ON public.commissions
  FOR SELECT USING (status = 'ACTIVE' OR public.is_admin());

DROP POLICY IF EXISTS commissions_admin_write ON public.commissions;
CREATE POLICY commissions_admin_write ON public.commissions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── get_active_commission(category_id) ─────────────────────────────────────
-- Category-specific rate wins, falls back to the platform-wide default
-- (target_category_id IS NULL, is_default = true), returns NULL row
-- values if genuinely nothing is configured yet. Matches this codebase's
-- existing rule from ADR-009: never invent a number nobody approved,
-- leaving commission_rate_applied NULL is correct until an admin sets one.
CREATE OR REPLACE FUNCTION public.get_active_commission(p_category_id INT)
RETURNS TABLE (commission_id BIGINT, percentage_rate NUMERIC, fixed_fee_cents BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, percentage_rate, fixed_fee_cents
  FROM (
    SELECT id, percentage_rate, fixed_fee_cents, 1 AS priority
    FROM public.commissions
    WHERE status = 'ACTIVE' AND target_category_id = p_category_id
    UNION ALL
    SELECT id, percentage_rate, fixed_fee_cents, 2 AS priority
    FROM public.commissions
    WHERE status = 'ACTIVE' AND target_category_id IS NULL AND is_default = true
  ) ranked
  ORDER BY priority
  LIMIT 1;
$$;

-- ── activate_scheduled_commissions() ────────────────────────────────────────
-- Runs every minute via pg_cron. Expires anything past its expiry_date
-- first (independent of whether a successor exists), then activates
-- anything whose effective_date has arrived, expiring the prior ACTIVE
-- row for the same category since the unique index above only allows one.
CREATE OR REPLACE FUNCTION public.activate_scheduled_commissions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Expire anything whose time is up, scheduled or active, promo ending
  --    with no successor included.
  UPDATE public.commissions
  SET status = 'EXPIRED', updated_at = now()
  WHERE status IN ('ACTIVE', 'SCHEDULED')
    AND expiry_date IS NOT NULL
    AND expiry_date <= now();

  -- 2. For every category with a commission whose effective_date has
  --    arrived, expire the current ACTIVE row (if any) and activate the
  --    new one. If more than one SCHEDULED row for the same category
  --    came due before this job last ran, only the one with the latest
  --    effective_date wins, the rest are marked EXPIRED without ever
  --    having been active, rather than colliding on the one-ACTIVE-per-
  --    category unique index.
  WITH due AS (
    SELECT id, target_category_id, effective_date,
           ROW_NUMBER() OVER (PARTITION BY target_category_id ORDER BY effective_date DESC) AS rn
    FROM public.commissions
    WHERE status = 'SCHEDULED' AND effective_date <= now()
  )
  UPDATE public.commissions c
  SET status = 'EXPIRED', updated_at = now()
  FROM due
  WHERE due.rn = 1
    AND c.status = 'ACTIVE'
    AND c.target_category_id IS NOT DISTINCT FROM due.target_category_id;

  WITH due AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY target_category_id ORDER BY effective_date DESC) AS rn
    FROM public.commissions
    WHERE status = 'SCHEDULED' AND effective_date <= now()
  )
  UPDATE public.commissions
  SET status = 'ACTIVE', updated_at = now()
  WHERE id IN (SELECT id FROM due WHERE rn = 1);

  WITH due AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY target_category_id ORDER BY effective_date DESC) AS rn
    FROM public.commissions
    WHERE status = 'SCHEDULED' AND effective_date <= now()
  )
  UPDATE public.commissions
  SET status = 'EXPIRED', updated_at = now()
  WHERE id IN (SELECT id FROM due WHERE rn > 1);
END;
$$;

-- Idempotent schedule registration, safe to rerun this migration.
DO $outer$
BEGIN
  PERFORM cron.unschedule('activate-scheduled-commissions')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activate-scheduled-commissions');
  PERFORM cron.schedule(
    'activate-scheduled-commissions',
    '* * * * *',
    $cron$SELECT public.activate_scheduled_commissions();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may not be available in every environment (e.g. local dev),
  -- don't fail the whole migration over the scheduler registration.
  RAISE NOTICE 'Could not register pg_cron job, run it manually if needed: %', SQLERRM;
END $outer$;
