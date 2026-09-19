-- ============================================================================
-- Business Pages: the storefront layer discussed for DealMatch monetization
-- section 8. A business page is metadata that sits above a profile's
-- existing listings, it does not duplicate them: listings already key off
-- listings.user_id (see listingsService.js), so "this page's listings" is
-- just a query filtered by owner, not a new join table.
--
-- Everything else the page needs to display already exists:
--   - verified_providers (ADR-008) for the verification badge/level
--   - provider_stats for rating and completion rate
-- The one thing provider_stats is missing for a page's stats strip is
-- completed/disputed deal counts, added below as two extra columns on the
-- same view rather than a new one, since they come from the same tx_agg
-- CTE that already scans public.transactions.
--
-- Subscription plan (free/pro/business/enterprise) is intentionally NOT
-- stored here. Per the bundling decision, plan lives wherever the
-- professional_applications-style subscription record ends up and this
-- table's tier-gated rendering (multi-listing display, custom banner,
-- analytics) should read that value, not a second copy of it. Left for a
-- follow-up migration once that general subscriptions table exists.
-- ============================================================================

-- ── business_pages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_pages (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  banner_url    TEXT,
  bio           TEXT,
  categories    TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- created_at on this row is what the page's "member since" stat reads, not
-- profiles.created_at, since a profile can predate its business page.

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_pages_profile_id ON public.business_pages(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_pages_slug       ON public.business_pages(slug);
CREATE INDEX IF NOT EXISTS idx_business_pages_categories       ON public.business_pages USING GIN (categories);

COMMENT ON TABLE public.business_pages IS
  'Storefront metadata for a profile, one per business. Listings are NOT '
  'stored here, they are read live from public.listings.user_id = profile_id. '
  'Verification badge comes from verified_providers, stats from '
  'provider_stats, both joined at query time by the client.';

COMMENT ON COLUMN public.business_pages.slug IS
  'URL slug for the public page (e.g. /store/amaka-konnect-services). '
  'Generated from display_name at creation time, editable afterwards.';

DROP TRIGGER IF EXISTS trg_business_pages_updated_at ON public.business_pages;
CREATE TRIGGER trg_business_pages_updated_at
  BEFORE UPDATE ON public.business_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.business_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_pages_select_public ON public.business_pages;
CREATE POLICY business_pages_select_public ON public.business_pages
  FOR SELECT USING (is_active = true OR auth.uid() = profile_id);

DROP POLICY IF EXISTS business_pages_insert_own ON public.business_pages;
CREATE POLICY business_pages_insert_own ON public.business_pages
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS business_pages_update_own ON public.business_pages;
CREATE POLICY business_pages_update_own ON public.business_pages
  FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS business_pages_delete_own ON public.business_pages;
CREATE POLICY business_pages_delete_own ON public.business_pages
  FOR DELETE USING (auth.uid() = profile_id);

-- ── provider_stats: add completed_count and disputed_count ────────────────
-- Same tx_agg CTE as 20260731000017, just two more FILTER columns off the
-- same scan of public.transactions. No new view, no new table.
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
    ) AS completion_rate,
    COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
    COUNT(*) FILTER (WHERE status = 'DISPUTED')  AS disputed_count
  FROM public.transactions
  WHERE provider_id IS NOT NULL
  GROUP BY provider_id
)
SELECT
  COALESCE(r.provider_id, t.provider_id) AS provider_id,
  COALESCE(r.review_count, 0)            AS review_count,
  r.avg_rating,
  t.completion_rate,
  COALESCE(t.completed_count, 0)         AS completed_count,
  COALESCE(t.disputed_count, 0)          AS disputed_count
FROM review_agg r
FULL OUTER JOIN tx_agg t ON t.provider_id = r.provider_id;

COMMENT ON VIEW public.provider_stats IS
  'Per-provider aggregates for Provider Profile and Business Page screens. '
  'Extended 2026-09-09 (business_pages migration) with completed_count and '
  'disputed_count for the Business Page stats strip, alongside the '
  'review_count/avg_rating/completion_rate already used by '
  'ProviderProfilePage. Same tx_agg scan as 20260731000017, no new view.';
