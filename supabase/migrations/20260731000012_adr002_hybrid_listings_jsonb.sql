-- ============================================================================
-- ADR-002 RESOLVED: Hybrid (Listings + JSONB)
--
-- Decision: do NOT migrate properties / student_hostels / professionals data
-- into category_listings. Their core columns, indexes, foreign keys, and all
-- existing application code stay exactly as they are, zero risk to what's
-- live today. Instead:
--   1. Each legacy table gets a JSONB `attributes` column, so future
--      category-specific fields can be added the same schema-driven way
--      category_listings already works, without a DDL migration each time.
--   2. Each legacy vertical becomes a real row in `categories`, with a new
--      `source_table` column recording which physical table backs it.
--      NULL source_table means "native category_listings row", exactly as
--      every category has worked so far.
--   3. One `universal_match` RPC unifies browse/filter/geo-matching across
--      category_listings AND all three legacy tables, mirroring the same
--      UNION-based pattern already proven in `universal_search` (ADR-012).
--
-- This is additive only. No existing table, column, row, or RLS policy is
-- altered or removed.
-- ============================================================================

-- ── 1. JSONB attributes on every legacy table ───────────────────────────────
ALTER TABLE public.properties      ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.student_hostels ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.professionals   ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_properties_attributes      ON public.properties USING GIN(attributes);
CREATE INDEX IF NOT EXISTS idx_student_hostels_attributes ON public.student_hostels USING GIN(attributes);
CREATE INDEX IF NOT EXISTS idx_professionals_attributes   ON public.professionals USING GIN(attributes);

-- ── 2. Register legacy verticals as real categories ─────────────────────────
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS source_table VARCHAR(50);

COMMENT ON COLUMN public.categories.source_table IS
  'Hybrid model (ADR-002): NULL means this category''s listings live in '
  'category_listings, same as every category before this migration. A '
  'non-NULL value (properties/student_hostels/professionals) means this '
  'category is a legacy vertical whose core data stays on its own table; '
  'only new, schema-driven fields go through that table''s attributes JSONB '
  'column. universal_match() reads this column to decide where to query.';

INSERT INTO public.categories (slug, name, source_table, intent_filter, attribute_schema) VALUES
('real-estate', 'Real Estate & Housing', 'properties', 'ASSET', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "furnished": { "type": "boolean" },
    "pet_friendly": { "type": "boolean" },
    "generator_included": { "type": "boolean" },
    "estate_type": { "type": "string", "enum": ["GATED", "STANDALONE", "APARTMENT_COMPLEX"] }
  }
}'::jsonb),
('student-hostels', 'Student Hostels', 'student_hostels', 'ASSET', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "wifi_included": { "type": "boolean" },
    "self_contained": { "type": "boolean" },
    "curfew_policy": { "type": "string" }
  }
}'::jsonb),
('professionals', 'Real Estate Professionals', 'professionals', 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "years_experience": { "type": "integer", "minimum": 0 },
    "languages": { "type": "array", "items": { "type": "string" } }
  }
}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ── 3. Universal match: category_listings + every legacy table, one shape ──
CREATE OR REPLACE FUNCTION universal_match(
  p_category_slug VARCHAR,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_radius_m INT DEFAULT 10000,
  p_attribute_filter JSONB DEFAULT '{}'::jsonb,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  source TEXT,
  item_id TEXT,
  title TEXT,
  price_cents BIGINT,
  location_name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  attributes JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_category_id INT;
  v_source_table VARCHAR;
BEGIN
  SELECT id, categories.source_table INTO v_category_id, v_source_table
  FROM public.categories WHERE slug = p_category_slug;

  IF v_category_id IS NULL THEN
    RETURN;
  END IF;

  IF v_source_table IS NULL THEN
    -- Native category_listings category: SUPPLY side only (browse/match UI use case)
    RETURN QUERY
    SELECT
      'category_listings'::text, cl.id::text, cl.title, cl.price_cents, cl.location_name,
      CASE WHEN cl.location IS NOT NULL THEN ST_Y(cl.location::geometry) END,
      CASE WHEN cl.location IS NOT NULL THEN ST_X(cl.location::geometry) END,
      cl.attributes, cl.created_at
    FROM public.category_listings cl
    WHERE cl.category_id = v_category_id
      AND cl.type = 'SUPPLY'
      AND cl.status = 'ACTIVE'
      AND (p_lat IS NULL OR p_lng IS NULL OR cl.location IS NULL
           OR ST_DWithin(cl.location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m))
      AND cl.attributes @> p_attribute_filter
    ORDER BY cl.created_at DESC
    LIMIT p_limit;

  ELSIF v_source_table = 'properties' THEN
    RETURN QUERY
    SELECT
      'properties'::text, p.id::text, p.title, (p.price * 100)::bigint,
      (p.city || ', ' || p.state), p.latitude::double precision, p.longitude::double precision,
      p.attributes, p.created_at
    FROM public.properties p
    WHERE p.status = 'active'
      AND (p_lat IS NULL OR p_lng IS NULL OR p.latitude IS NULL OR p.longitude IS NULL
           OR ST_DWithin(
                ST_MakePoint(p.longitude, p.latitude)::geography,
                ST_MakePoint(p_lng, p_lat)::geography, p_radius_m))
      AND p.attributes @> p_attribute_filter
    ORDER BY p.created_at DESC
    LIMIT p_limit;

  ELSIF v_source_table = 'student_hostels' THEN
    RETURN QUERY
    SELECT
      'student_hostels'::text, sh.id::text, sh.title, (sh.price_per_year * 100)::bigint,
      (sh.city || ', ' || sh.state), sh.latitude::double precision, sh.longitude::double precision,
      sh.attributes, sh.created_at
    FROM public.student_hostels sh
    WHERE sh.status = 'active'
      AND (p_lat IS NULL OR p_lng IS NULL OR sh.latitude IS NULL OR sh.longitude IS NULL
           OR ST_DWithin(
                ST_MakePoint(sh.longitude, sh.latitude)::geography,
                ST_MakePoint(p_lng, p_lat)::geography, p_radius_m))
      AND sh.attributes @> p_attribute_filter
    ORDER BY sh.created_at DESC
    LIMIT p_limit;

  ELSIF v_source_table = 'professionals' THEN
    RETURN QUERY
    SELECT
      'professionals'::text, pr.id::text,
      (pr.full_name || COALESCE(', ' || pr.company_name, '')), NULL::bigint,
      pr.coverage_areas, NULL::double precision, NULL::double precision,
      pr.attributes, pr.created_at
    FROM public.professionals pr
    WHERE pr.is_active = true
      AND pr.attributes @> p_attribute_filter
    ORDER BY pr.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION universal_match IS
  'Hybrid model (ADR-002): browse/filter/geo-match across category_listings '
  'and every legacy vertical in one call, dispatched by categories.source_table. '
  'Returns explicit lat/lng floats, never a raw geography value, matching the '
  'convention established for match_category_listings. Legacy verticals are '
  'SUPPLY-only (no two-sided demand posting yet for those tables) -- posting '
  'a DEMAND for a legacy vertical is not built and this function does not '
  'claim to support it.';
