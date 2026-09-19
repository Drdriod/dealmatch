-- ============================================================================
-- ADR-007: Taxonomy Corrections (dynamic catalog / categories table)
-- Merges Heavy Machinery into a new Automotive & Machinery group, broadens
-- Artisans into a Skills, Trades & Daily Services group, renames Logistics.
-- Additive only: existing rows are re-parented and renamed, never deleted,
-- so no category_id foreign key ever breaks.
-- ============================================================================

-- ── Automotive & Machinery ──────────────────────────────────────────────────
INSERT INTO public.categories (slug, name, attribute_schema, intent_filter) VALUES
('automotive-machinery', 'Automotive & Machinery', '{}'::jsonb, NULL)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'automotive-machinery')
WHERE slug = 'automotive';

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'automotive-machinery')
WHERE slug = 'heavy-machinery-asset-leasing';

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'auto-services-parts', 'Auto Services & Parts', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["MECHANIC", "PANEL_BEATER", "TYRE_SERVICE", "CAR_WASH", "PARTS_DEALER", "TOWING"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "mobile_service": { "type": "boolean" }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'automotive-machinery'
ON CONFLICT (slug) DO NOTHING;

-- ── Skills, Trades & Daily Services (broadens Artisans, does not replace it) ─
INSERT INTO public.categories (slug, name, attribute_schema, intent_filter) VALUES
('skills-trades-daily-services', 'Skills, Trades & Daily Services', '{}'::jsonb, NULL)
ON CONFLICT (slug) DO NOTHING;

-- Artisans keeps its slug and existing schema (avoids invalidating anything
-- already built against it), just moves under the broader group.
UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'skills-trades-daily-services')
WHERE slug = 'artisans';

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'cleaning-moving-facility', 'Cleaning, Moving & Facility', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["HOME_CLEANING", "OFFICE_CLEANING", "MOVING_HAULAGE", "FACILITY_MANAGEMENT", "FUMIGATION"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "certificate_optional": { "type": "boolean", "default": true }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'beauty-grooming-personal-care', 'Beauty, Grooming & Personal Care', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["HAIRSTYLIST", "BARBER", "MAKEUP_ARTIST", "NAIL_TECH", "MASSAGE_THERAPIST", "SPA"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "mobile_service": { "type": "boolean" }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'cooking-catering-domestic', 'Cooking, Catering & Domestic', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["PRIVATE_CHEF", "CATERER", "HOUSEKEEPER", "NANNY", "LAUNDRY"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "live_in_available": { "type": "boolean" }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'creative-practical-skills', 'Creative & Practical Skills', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "skill_type": { "type": "string" },
    "years_experience": { "type": "integer", "minimum": 0 },
    "certificate_optional": { "type": "boolean", "default": true },
    "portfolio_url": { "type": "string" }
  },
  "required": ["skill_type"]
}'::jsonb
FROM public.categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

-- ── Rename Logistics group (slug unchanged, FK-safe) ────────────────────────
UPDATE public.categories
SET name = 'Logistics & Mobility'
WHERE slug = 'logistics-haulage-equipment-rental';
