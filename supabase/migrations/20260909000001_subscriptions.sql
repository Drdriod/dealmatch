-- ============================================================================
-- Subscriptions: one plan per profile, the single source of truth the
-- bundling decision depends on. Business Page tier, the Verified badge
-- inclusion, and any future escrow-rate breaks should all read
-- public.get_active_plan(profile_id) rather than each maintaining their
-- own copy of "what tier is this business on".
--
-- professional_applications already has subscription_plan/subscription_start
-- /subscription_expiry columns, but those are scoped to one onboarding flow
-- (paid property professionals) and shouldn't be overloaded to mean "this
-- profile's general plan" -- a business with a Pro subscription may never
-- touch that table at all. This is deliberately a new, general table
-- rather than a rename of the existing one.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.subscription_plan AS ENUM ('free', 'pro', 'business', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('active', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                 BIGSERIAL PRIMARY KEY,
  profile_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan               public.subscription_plan NOT NULL DEFAULT 'free',
  status             public.subscription_status NOT NULL DEFAULT 'active',
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,           -- NULL = doesn't lapse on its own (e.g. free, or admin-granted)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per profile: upgrading/downgrading updates this row in place,
-- it does not insert a new one. Billing-history detail, if ever needed,
-- belongs in a separate ledger table, not here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_profile_id ON public.subscriptions(profile_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_status      ON public.subscriptions(plan, status);

COMMENT ON TABLE public.subscriptions IS
  'Single source of truth for a profile''s plan (free/pro/business/enterprise). '
  'Business Page tier features and Verified-badge bundling should both read '
  'public.get_active_plan(profile_id), not store their own copy of the plan.';

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT USING (auth.uid() = profile_id OR public.is_admin());

-- Deliberately no client INSERT/UPDATE policy: a profile should not be able
-- to grant itself "enterprise" by writing this row directly. Plan changes
-- go through a SECURITY DEFINER function (payment webhook / admin action),
-- mirroring how professional_applications approval never lets the
-- applicant flip their own status.
DROP POLICY IF EXISTS subscriptions_admin_write ON public.subscriptions;
CREATE POLICY subscriptions_admin_write ON public.subscriptions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── get_active_plan(profile_id) ────────────────────────────────────────────
-- SECURITY DEFINER so any page (Business Page, Verified badge, future
-- escrow-rate check) can call this without needing its own SELECT policy
-- on subscriptions for other people's rows. Returns 'free' for anyone with
-- no row, an expired period, or a cancelled/expired status, never NULL.
CREATE OR REPLACE FUNCTION public.get_active_plan(p_profile_id UUID)
RETURNS public.subscription_plan
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plan;
BEGIN
  SELECT plan INTO v_plan
  FROM public.subscriptions
  WHERE profile_id = p_profile_id
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > now());

  RETURN COALESCE(v_plan, 'free');
END;
$$;

COMMENT ON FUNCTION public.get_active_plan(UUID) IS
  'Returns the effective plan for a profile, always free/pro/business/'
  'enterprise, never NULL. This is the one place "is this plan active '
  'right now" gets decided, callers should not re-derive it from raw '
  'subscriptions rows.';
