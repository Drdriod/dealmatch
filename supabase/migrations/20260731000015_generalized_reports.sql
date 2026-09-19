-- ============================================================================
-- Generalize moderation/reporting beyond Real Estate.
--
-- The existing `complaints` table only has a property_id column, so
-- reporting only ever worked for PropertyPage. This adds a polymorphic
-- `reports` table (entity_type + entity_id) that covers every listing
-- source (properties, professionals, student_hostels, category_listings,
-- forum posts) with one schema and one RLS policy set, instead of a new
-- column and a new modal per vertical.
--
-- `complaints` is left in place, untouched, for existing data - nothing
-- reads/writes it after this migration except historical records.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id               BIGSERIAL PRIMARY KEY,
  reporter_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Polymorphic target: which kind of thing, which row. entity_id is TEXT
  -- because targets span bigint (category_listings, professionals),
  -- and uuid (some legacy tables) primary keys.
  entity_type      TEXT NOT NULL CHECK (entity_type IN (
                      'property', 'professional', 'student_hostel',
                      'category_listing', 'forum_post', 'user'
                    )),
  entity_id        TEXT NOT NULL,
  listing_source    TEXT,  -- mirrors universal_match()'s `source`, nullable for non-listing targets (e.g. 'user')

  category         TEXT NOT NULL,
  description      TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  resolution_notes TEXT,
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES auth.users(id),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_entity        ON public.reports(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter       ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status         ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at     ON public.reports(created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reports_insert_own ON public.reports;
CREATE POLICY reports_insert_own ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS reports_select_own ON public.reports;
CREATE POLICY reports_select_own ON public.reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- Status/resolution fields are admin-only writes, same reasoning as the
-- verified_providers no-client-write policy in the ADR-008 migration:
-- a raw client UPDATE must not be able to self-resolve or dismiss a report.
DROP POLICY IF EXISTS reports_no_client_update ON public.reports;
CREATE POLICY reports_no_client_update ON public.reports
  FOR UPDATE USING (false);

CREATE OR REPLACE FUNCTION public.resolve_report(
  p_report_id BIGINT,
  p_status TEXT,
  p_resolution_notes TEXT,
  p_resolved_by UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('investigating', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'invalid resolution status: %', p_status;
  END IF;

  UPDATE public.reports
  SET status = p_status,
      resolution_notes = p_resolution_notes,
      resolved_at = CASE WHEN p_status IN ('resolved','dismissed') THEN now() ELSE resolved_at END,
      resolved_by = p_resolved_by
  WHERE id = p_report_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_report IS
  'Admin-only write path (SECURITY DEFINER, bypasses reports_no_client_update). '
  'Call only from an authenticated admin API route -- this function does not '
  'itself check caller role, the route calling it must.';
