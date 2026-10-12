-- ============================================================================
-- Universal search: optional category filter, verified people as a source,
-- and properties tagged with their real category.
--
-- Changes the signature (adds p_category_slug), so the old function is dropped
-- first. Existing callers pass p_query and p_limit by name and keep working,
-- because the new parameter has a default.
--
-- Filter behaviour: a group slug returns that group and all of its leaves; a
-- leaf slug returns only that leaf. NULL returns everything (the default).
--
-- Grants are re-applied to match the previous hardening (anon, authenticated,
-- service_role), because a new signature starts with PUBLIC execute.
-- ============================================================================

DROP FUNCTION IF EXISTS public.universal_search(TEXT, INT);

CREATE OR REPLACE FUNCTION public.universal_search(
  p_query         TEXT,
  p_limit         INT  DEFAULT 30,
  p_category_slug TEXT DEFAULT NULL
)
RETURNS TABLE (
  source        TEXT,
  item_id       TEXT,
  category_slug TEXT,
  category_name TEXT,
  title         TEXT,
  snippet       TEXT,
  price_cents   BIGINT,
  location_name TEXT,
  url_path      TEXT,
  created_at    TIMESTAMPTZ,
  search_rank   REAL
)
LANGUAGE sql STABLE
AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_query) AS tsq),
  hits AS (
    -- Service listings (category_listings), tagged by their category
    -- The first branch names the columns for the whole UNION, so it carries the aliases.
    SELECT
      'category_listings'::text        AS source,
      cl.id::text                      AS item_id,
      c.slug::text                     AS category_slug,
      c.name::text                     AS category_name,
      cl.title::text                   AS title,
      left(coalesce(cl.description, ''), 200)::text AS snippet,
      cl.price_cents                   AS price_cents,
      cl.location_name::text           AS location_name,
      ('/marketplace/' || c.slug || '/listing/' || cl.id::text)::text AS url_path,
      cl.created_at                    AS created_at,
      ts_rank(
        setweight(to_tsvector('english', cl.title), 'A') ||
        setweight(to_tsvector('english', coalesce(cl.description, '')), 'B'),
        (SELECT tsq FROM q)
      )::real                          AS search_rank
    FROM public.category_listings cl
    JOIN public.categories c ON c.id = cl.category_id
    WHERE cl.status = 'ACTIVE'
      AND (SELECT tsq FROM q) @@ (
        setweight(to_tsvector('english', cl.title), 'A') ||
        setweight(to_tsvector('english', coalesce(cl.description, '')), 'B')
      )

    UNION ALL

    -- Places (properties). Tagged with the real category when one is set.
    SELECT
      'properties'::text,
      p.id::text,
      pc.slug::text,
      pc.name::text,
      p.title::text,
      left(coalesce(p.description, ''), 200)::text,
      (p.price * 100)::bigint,
      (p.city || ', ' || p.state)::text,
      ('/property/' || p.id::text)::text,
      p.created_at,
      ts_rank(p.search_vector, (SELECT tsq FROM q))::real
    FROM public.properties p
    LEFT JOIN public.categories pc ON pc.id = p.category_id
    WHERE p.status = 'active'
      AND (SELECT tsq FROM q) @@ p.search_vector

    UNION ALL

    -- Student hostels (a leaf under Residential Rentals)
    SELECT
      'student_hostels'::text,
      sh.id::text,
      'student-hostels'::text,
      'Student Hostels'::text,
      sh.title::text,
      left(coalesce(sh.description, ''), 200)::text,
      (sh.price_per_year * 100)::bigint,
      (sh.city || ', ' || sh.state)::text,
      ('/student-hostels/' || sh.id::text)::text,
      sh.created_at,
      ts_rank(sh.search_vector, (SELECT tsq FROM q))::real
    FROM public.student_hostels sh
    WHERE sh.status = 'active'
      AND (SELECT tsq FROM q) @@ sh.search_vector

    UNION ALL

    -- Real estate professionals directory (a leaf under Licensed Experts)
    SELECT
      'professionals'::text,
      pr.id::text,
      'professionals'::text,
      'Real Estate Professionals'::text,
      (pr.full_name || coalesce(', ' || pr.company_name, ''))::text,
      left(coalesce(pr.bio, ''), 200)::text,
      NULL::bigint,
      pr.coverage_areas::text,
      ('/professionals/' || pr.id::text)::text,
      pr.created_at,
      ts_rank(pr.search_vector, (SELECT tsq FROM q))::real
    FROM public.professionals pr
    WHERE pr.is_active = true
      AND (SELECT tsq FROM q) @@ pr.search_vector

    UNION ALL

    -- Verified people (level 2 and above), matched on name and category label.
    -- Tagged with the category the provider declared, when it matches a leaf.
    SELECT
      'verified_providers'::text,
      vp.user_id::text,
      c.slug::text,
      c.name::text,
      coalesce(pp.full_name, 'DealMatch provider')::text,
      coalesce(vp.level_data->>'category', '')::text,
      NULL::bigint,
      coalesce(vp.level_data->>'area', pp.city || ', ' || pp.state)::text,
      ('/provider/' || vp.user_id::text)::text,
      vp.updated_at,
      ts_rank(
        to_tsvector('english', coalesce(pp.full_name, '') || ' ' || coalesce(vp.level_data->>'category', '')),
        (SELECT tsq FROM q)
      )::real
    FROM public.verified_providers vp
    LEFT JOIN public.public_profiles pp ON pp.id = vp.user_id
    LEFT JOIN public.categories c
      ON c.name = vp.level_data->>'category'
     AND c.parent_id IS NOT NULL
     AND c.is_active
    WHERE vp.level >= 2
      AND (SELECT tsq FROM q) @@ to_tsvector('english',
            coalesce(pp.full_name, '') || ' ' || coalesce(vp.level_data->>'category', ''))
  )
  SELECT h.*
    FROM hits h
   WHERE p_category_slug IS NULL
      OR h.category_slug = p_category_slug
      OR h.category_slug IN (
           SELECT ch.slug
             FROM public.categories ch
             JOIN public.categories par ON par.id = ch.parent_id
            WHERE par.slug = p_category_slug
         )
   ORDER BY h.search_rank DESC, h.created_at DESC
   LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.universal_search(TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.universal_search(TEXT, INT, TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.universal_search(TEXT, INT, TEXT) IS
  'Federated search across service listings, places, student hostels, real estate professionals and verified people (ADR-012). '
  'Optional p_category_slug limits results to one group (with its leaves) or one leaf. '
  'Called via supabase.rpc(''universal_search'', {...}) from src/modules/search/searchService.js.';
