-- ============================================================================
-- Fix: match_category_listings returned `location` as a raw PostGIS
-- geography column (RETURNS SETOF category_listings). Whether that
-- serializes to parseable GeoJSON depends on PostgREST/Supabase-js
-- configuration and was never actually verified against a live database.
-- A map component built on `listing.location.coordinates` would have been
-- built on an unverified assumption. This replaces the function with an
-- explicit RETURNS TABLE that computes `lat`/`lng` as plain floats via
-- ST_Y/ST_X, so callers never have to parse a geography value at all.
-- ============================================================================

DROP FUNCTION IF EXISTS match_category_listings(INT, VARCHAR, DOUBLE PRECISION, DOUBLE PRECISION, INT, JSONB, INT);

CREATE OR REPLACE FUNCTION match_category_listings(
  p_category_id INT,
  p_type VARCHAR,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_m INT DEFAULT 10000,
  p_attribute_filter JSONB DEFAULT '{}'::jsonb,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id INT,
  type VARCHAR,
  title VARCHAR,
  description TEXT,
  price_cents BIGINT,
  status VARCHAR,
  location_name VARCHAR,
  attributes JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    cl.id, cl.user_id, cl.category_id, cl.type, cl.title, cl.description,
    cl.price_cents, cl.status, cl.location_name, cl.attributes,
    cl.created_at, cl.updated_at,
    CASE WHEN cl.location IS NOT NULL THEN ST_Y(cl.location::geometry) END AS lat,
    CASE WHEN cl.location IS NOT NULL THEN ST_X(cl.location::geometry) END AS lng
  FROM public.category_listings cl
  WHERE cl.category_id = p_category_id
    AND cl.type = p_type
    AND cl.status = 'ACTIVE'
    AND (
      p_lat IS NULL OR p_lng IS NULL OR cl.location IS NULL
      OR ST_DWithin(cl.location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
    )
    AND cl.attributes @> p_attribute_filter
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND cl.location IS NOT NULL
      THEN cl.location <-> ST_MakePoint(p_lng, p_lat)::geography
      ELSE NULL
    END NULLS LAST,
    cl.created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION match_category_listings IS
  'Combines JSONB attribute containment with PostGIS radius search, and returns '
  'explicit lat/lng float columns (not a raw geography value) so consumers, '
  'including the marketplace map, never need to parse PostGIS output. '
  'Called via supabase.rpc(''match_category_listings'', {...}) from api/platform.js (resource=category-match).';

-- Single-listing equivalent, same fix, used by the listing-detail resource so
-- getListing() doesn't inherit the same raw-geography ambiguity that
-- match_category_listings had before this migration.
CREATE OR REPLACE FUNCTION get_listing_with_latlng(p_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id INT,
  type VARCHAR,
  title VARCHAR,
  description TEXT,
  price_cents BIGINT,
  status VARCHAR,
  location_name VARCHAR,
  attributes JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    cl.id, cl.user_id, cl.category_id, cl.type, cl.title, cl.description,
    cl.price_cents, cl.status, cl.location_name, cl.attributes,
    cl.created_at, cl.updated_at,
    CASE WHEN cl.location IS NOT NULL THEN ST_Y(cl.location::geometry) END AS lat,
    CASE WHEN cl.location IS NOT NULL THEN ST_X(cl.location::geometry) END AS lng
  FROM public.category_listings cl
  WHERE cl.id = p_id;
$$;

COMMENT ON FUNCTION get_listing_with_latlng IS
  'Single-row lookup for category_listings with explicit lat/lng, replacing the '
  'plain .from(category_listings).select(*) previously used by getListing() in '
  'listingsService.js, which returned an unparsed geography value for location.';
