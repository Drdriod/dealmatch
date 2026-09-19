-- ============================================================================
-- DealMatch Multi-Category Catalog
-- Adds dynamic-category support (Automotive, Artisans, Corporate Services,
-- Talent/Teacher Recruitment) alongside the existing Real Estate schema.
-- This migration is ADDITIVE ONLY: it does not touch properties,
-- student_hostels, professionals, or any other existing table.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_net;      -- required for the webhook trigger below

-- ── 1. Categories ────────────────────────────────────────────────────────────
CREATE TABLE public.categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  parent_id INT REFERENCES public.categories(id) ON DELETE CASCADE,
  attribute_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.categories IS
  'New category metadata + JSON Schema for dynamic attribute validation. '
  'A new category is added by inserting a row here - no DDL migration required.';

-- ── 2. Unified listings table for new categories ───────────────────────────
CREATE TABLE public.category_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id INT NOT NULL REFERENCES public.categories(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('SUPPLY', 'DEMAND')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price_cents BIGINT,
  status VARCHAR(50) DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'MATCHED', 'SUSPENDED', 'CLOSED')),
  location GEOGRAPHY(POINT, 4326),
  location_name VARCHAR(255),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_category_listings_cat_type ON public.category_listings(category_id, type);
CREATE INDEX idx_category_listings_status   ON public.category_listings(status);
CREATE INDEX idx_category_listings_location ON public.category_listings USING GIST(location);
CREATE INDEX idx_category_listings_attrs    ON public.category_listings USING GIN(attributes);
CREATE INDEX idx_category_listings_user     ON public.category_listings(user_id);

-- keep updated_at fresh, same pattern likely used elsewhere in this project
CREATE OR REPLACE FUNCTION set_category_listings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_listings_updated_at
  BEFORE UPDATE ON public.category_listings
  FOR EACH ROW EXECUTE FUNCTION set_category_listings_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "listings_public_read_active" ON public.category_listings
  FOR SELECT USING (status = 'ACTIVE');

CREATE POLICY "listings_owner_read_own" ON public.category_listings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "listings_owner_insert" ON public.category_listings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "listings_owner_update" ON public.category_listings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "listings_owner_delete" ON public.category_listings
  FOR DELETE USING (auth.uid() = user_id);

-- ── 4. Matching RPC: JSONB containment + PostGIS radius search ─────────────
CREATE OR REPLACE FUNCTION match_category_listings(
  p_category_id INT,
  p_type VARCHAR,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_m INT DEFAULT 10000,
  p_attribute_filter JSONB DEFAULT '{}'::jsonb,
  p_limit INT DEFAULT 50
)
RETURNS SETOF public.category_listings
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM public.category_listings
  WHERE category_id = p_category_id
    AND type = p_type
    AND status = 'ACTIVE'
    AND (
      p_lat IS NULL OR p_lng IS NULL OR location IS NULL
      OR ST_DWithin(location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
    )
    AND attributes @> p_attribute_filter
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND location IS NOT NULL
      THEN location <-> ST_MakePoint(p_lng, p_lat)::geography
      ELSE NULL
    END NULLS LAST,
    created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION match_category_listings IS
  'Combines JSONB attribute containment with PostGIS radius search. '
  'Called via supabase.rpc(''match_category_listings'', {...}) from api/platform.js (resource=category-match).';

-- ── 5. Async event notification (replaces the in-process event bus) ────────
-- On INSERT of a new SUPPLY/DEMAND listing, fire an HTTP POST to the Vercel
-- endpoint that would previously have subscribed to `supply.created` /
-- `demand.created` on an in-process bus. Requires `app.settings.app_url` to
-- be set (see setup note at bottom of file) and `pg_net` enabled above.
CREATE OR REPLACE FUNCTION notify_listing_created()
RETURNS TRIGGER AS $$
DECLARE
  target_url TEXT := current_setting('app.settings.listing_webhook_url', true);
BEGIN
  IF target_url IS NOT NULL AND target_url <> '' THEN
    PERFORM net.http_post(
      url := target_url,
      body := jsonb_build_object(
        'eventName', lower(NEW.type) || '.created',
        'payload', jsonb_build_object(
          'entityId', NEW.id,
          'categoryId', NEW.category_id,
          'type', NEW.type,
          'attributes', NEW.attributes
        ),
        'timestamp', NEW.created_at
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_listing_created
  AFTER INSERT ON public.category_listings
  FOR EACH ROW EXECUTE FUNCTION notify_listing_created();

-- ============================================================================
-- MANUAL SETUP STEP (cannot be scripted - run once per environment):
--   ALTER DATABASE postgres SET app.settings.listing_webhook_url =
--     'https://www.dealmatch.com.ng/api/events/listing-created';
--
-- If you'd rather configure this via the Supabase dashboard's Database
-- Webhooks UI instead of pg_net + this trigger, that works too - in that
-- case you can drop trg_notify_listing_created and notify_listing_created()
-- and point a dashboard webhook at the same /api/events/listing-created
-- endpoint. Either mechanism satisfies the same contract.
-- ============================================================================
