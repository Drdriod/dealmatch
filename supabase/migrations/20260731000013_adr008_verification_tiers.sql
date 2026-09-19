-- ============================================================================
-- ADR-008: Skill-first, three-tier verification
--
-- Decision: verified_providers gains a `level` (1/2/3) and `level_data` JSONB
-- instead of a per-category arbitrary `checks` array. One universal ladder:
--   Level 1, Identity   -- phone OTP, NIN/BVN check, facial/liveness match.
--                          Required for everyone. Gates browsing and
--                          low-risk jobs only.
--   Level 2, Skill      -- portfolio, work samples, informal references.
--                          Required to earn / appear in matching. Keeps
--                          "excellent uncertified people" inside the
--                          platform -- explicitly not certificate-gated.
--   Level 3, Trusted    -- certificates (bonus, not required), background
--                          checks for sensitive categories, insurance/bond,
--                          sustained rating threshold.
--
-- This is additive only, same pattern as ADR-002/ADR-006/ADR-007. Written
-- with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout so it runs
-- cleanly whether verified_providers already exists with other columns or
-- doesn't exist yet -- not assumed, so re-check the actual current schema
-- on staging before trusting this blind (the ADR-014 lesson: verify against
-- a live database, don't just assume a shape).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.verified_providers (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level        SMALLINT NOT NULL DEFAULT 0,
  level_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In case the table already existed before this migration with a different
-- shape, make sure the two columns this ADR actually needs are present.
ALTER TABLE public.verified_providers ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.verified_providers ADD COLUMN IF NOT EXISTS level_data JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.verified_providers
  DROP CONSTRAINT IF EXISTS verified_providers_level_check;
ALTER TABLE public.verified_providers
  ADD CONSTRAINT verified_providers_level_check CHECK (level BETWEEN 0 AND 3);

COMMENT ON COLUMN public.verified_providers.level IS
  'ADR-008 three-tier verification: 0 = none, 1 = Identity (phone OTP + '
  'NIN/BVN + liveness, required for everyone, gates browsing/low-risk jobs '
  'only), 2 = Skill (portfolio/work samples/references, required to appear '
  'in matching), 3 = Trusted (certificates as bonus, background check for '
  'sensitive categories, insurance/bond, sustained rating threshold).';

COMMENT ON COLUMN public.verified_providers.level_data IS
  'JSONB payload for whichever level is current, e.g. for level 1: '
  '{"nin_verified": true, "bvn_verified": true, "liveness_match_score": 0.97}; '
  'for level 2: {"portfolio_urls": [...], "references": [...]}; for level 3: '
  '{"certificates": [...], "background_check_ref": "...", "bonded": true}.';

CREATE INDEX IF NOT EXISTS idx_verified_providers_user_id ON public.verified_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_verified_providers_level   ON public.verified_providers(level);
CREATE UNIQUE INDEX IF NOT EXISTS uq_verified_providers_user_id ON public.verified_providers(user_id);

ALTER TABLE public.verified_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verified_providers_select_own ON public.verified_providers;
CREATE POLICY verified_providers_select_own ON public.verified_providers
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS verified_providers_select_public ON public.verified_providers;
CREATE POLICY verified_providers_select_public ON public.verified_providers
  FOR SELECT USING (level >= 1);

-- Level cannot be self-escalated by the provider; only a service-role
-- context (admin verification flow) should write it. Providers may submit
-- evidence into level_data via a controlled RPC (not built here), never a
-- raw UPDATE from the client.
DROP POLICY IF EXISTS verified_providers_no_client_write ON public.verified_providers;
CREATE POLICY verified_providers_no_client_write ON public.verified_providers
  FOR UPDATE USING (false);

CREATE OR REPLACE FUNCTION public.set_verification_level(
  p_user_id UUID,
  p_level SMALLINT,
  p_level_data JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_level NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'level must be between 0 and 3, got %', p_level;
  END IF;

  INSERT INTO public.verified_providers (user_id, level, level_data, updated_at)
  VALUES (p_user_id, p_level, COALESCE(p_level_data, '{}'::jsonb), now())
  ON CONFLICT (user_id) DO UPDATE
    SET level = EXCLUDED.level,
        level_data = EXCLUDED.level_data,
        updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.set_verification_level IS
  'Admin-only write path for verification level (SECURITY DEFINER, bypasses '
  'the no-client-write RLS policy). Call only from an authenticated admin '
  'API route -- this function itself does not check caller role, the route '
  'calling it must.';
