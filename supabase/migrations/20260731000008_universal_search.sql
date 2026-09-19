-- ============================================================================
-- Universal Search (ADR-012)
-- One database function federating search across category_listings (all new
-- categories) and the legacy tables (properties, student_hostels,
-- professionals) that ADR-002's migration hasn't unified yet. Additive only:
-- adds generated, indexed search columns to the legacy tables (same pattern
-- already used on forum_threads), does not modify existing columns or data.
-- ============================================================================

-- ── Indexed search columns on legacy tables ─────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_properties_search ON public.properties USING GIN(search_vector);

ALTER TABLE public.student_hostels
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_student_hostels_search ON public.student_hostels USING GIN(search_vector);

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(company_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_professionals_search ON public.professionals USING GIN(search_vector);

-- ── Federating search function ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.universal_search(p_query TEXT, p_limit INT DEFAULT 30)
RETURNS TABLE (
  source TEXT,
  item_id TEXT,
  category_slug TEXT,
  category_name TEXT,
  title TEXT,
  snippet TEXT,
  price_cents BIGINT,
  location_name TEXT,
  url_path TEXT,
  created_at TIMESTAMPTZ,
  search_rank REAL
)
LANGUAGE sql STABLE
AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_query) AS tsq)
  SELECT * FROM (
    -- New, schema-driven categories
    SELECT
      'category_listings' AS source,
      cl.id::text AS item_id,
      c.slug AS category_slug,
      c.name AS category_name,
      cl.title,
      left(coalesce(cl.description, ''), 200) AS snippet,
      cl.price_cents,
      cl.location_name,
      '/marketplace/' || c.slug || '/listing/' || cl.id::text AS url_path,
      cl.created_at,
      ts_rank(
        setweight(to_tsvector('english', cl.title), 'A') ||
        setweight(to_tsvector('english', coalesce(cl.description, '')), 'B'),
        (SELECT tsq FROM q)
      ) AS search_rank
    FROM public.category_listings cl
    JOIN public.categories c ON c.id = cl.category_id
    WHERE cl.status = 'ACTIVE'
      AND (SELECT tsq FROM q) @@ (
        setweight(to_tsvector('english', cl.title), 'A') ||
        setweight(to_tsvector('english', coalesce(cl.description, '')), 'B')
      )

    UNION ALL

    -- Real estate (sale, rent, and shortlet variants live on one legacy table)
    SELECT
      'properties',
      p.id::text,
      'real-estate-housing',
      'Real Estate & Housing',
      p.title,
      left(coalesce(p.description, ''), 200),
      (p.price * 100)::bigint,
      p.city || ', ' || p.state,
      '/property/' || p.id::text,
      p.created_at,
      ts_rank(p.search_vector, (SELECT tsq FROM q))
    FROM public.properties p
    WHERE p.status = 'active'
      AND (SELECT tsq FROM q) @@ p.search_vector

    UNION ALL

    -- Student hostels
    SELECT
      'student_hostels',
      sh.id::text,
      'student-hostels',
      'Student Hostels',
      sh.title,
      left(coalesce(sh.description, ''), 200),
      (sh.price_per_year * 100)::bigint,
      sh.city || ', ' || sh.state,
      '/student-hostels/' || sh.id::text,
      sh.created_at,
      ts_rank(sh.search_vector, (SELECT tsq FROM q))
    FROM public.student_hostels sh
    WHERE sh.status = 'active'
      AND (SELECT tsq FROM q) @@ sh.search_vector

    UNION ALL

    -- Real estate professionals directory
    SELECT
      'professionals',
      pr.id::text,
      'professionals',
      'Real Estate Professionals',
      pr.full_name || coalesce(', ' || pr.company_name, ''),
      left(coalesce(pr.bio, ''), 200),
      NULL::bigint,
      pr.coverage_areas,
      '/professionals/' || pr.id::text,
      pr.created_at,
      ts_rank(pr.search_vector, (SELECT tsq FROM q))
    FROM public.professionals pr
    WHERE pr.is_active = true
      AND (SELECT tsq FROM q) @@ pr.search_vector
  ) combined
  ORDER BY search_rank DESC, created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.universal_search IS
  'Federated search across category_listings and legacy verticals (ADR-012). '
  'Called via supabase.rpc(''universal_search'', {...}) from src/modules/search/searchService.js. '
  'Extend this function, not the calling code, when ADR-002''s migration unifies the legacy tables.';
