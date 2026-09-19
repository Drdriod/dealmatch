-- ============================================================================
-- Category Taxonomy Expansion
-- Adds the Intent Filter dimension (Need a Service / Buying-Renting Assets /
-- Hiring-Matching Supply&Demand) and restructures the catalog into proper
-- parent/child groups per the July 2026 taxonomy brief. Additive only.
--
-- 'teachers' and 'corporate-services' from the original multicategory seed
-- are superseded by richer structures below (Education/Tutoring group and
-- Professional & Business Services group respectively) - deactivated, not
-- deleted, so nothing referencing them by category_id breaks.
-- ============================================================================

ALTER TABLE public.categories
  ADD COLUMN intent_filter VARCHAR(20)
    CHECK (intent_filter IN ('SERVICE', 'ASSET', 'SUPPLY_DEMAND'));

COMMENT ON COLUMN public.categories.intent_filter IS
  'UX grouping dimension, independent of the vertical hierarchy: '
  'SERVICE = hire a provider (artisans, tutors, event vendors, health/home care), '
  'ASSET = buy/rent a thing (real estate, automotive, machinery), '
  'SUPPLY_DEMAND = two-sided matching (haulage<->cargo, schools<->teachers, retail<->distributor). '
  'NULL on parent/container rows that just group children.';

UPDATE public.categories SET is_active = false WHERE slug IN ('teachers', 'corporate-services');

-- Tag existing standalone categories with their intent
UPDATE public.categories SET intent_filter = 'ASSET'   WHERE slug = 'automotive';
UPDATE public.categories SET intent_filter = 'SERVICE' WHERE slug = 'artisans';

-- ── Parent groups ────────────────────────────────────────────────────────────
INSERT INTO public.categories (slug, name, attribute_schema, intent_filter) VALUES
('professional-business-services', 'Professional & Business Services', '{}'::jsonb, NULL),
('education-tutoring-skill-exchange', 'Education, Tutoring & Skill Exchange', '{}'::jsonb, NULL),
('logistics-haulage-equipment-rental', 'Logistics, Haulage & Equipment Rental', '{}'::jsonb, NULL),
('events-hospitality-entertainment', 'Events, Hospitality & Entertainment', '{}'::jsonb, NULL),
('health-wellness-home-care', 'Health, Wellness & Home Care', '{}'::jsonb, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── Group 1: Professional & Business Services (SERVICE) ────────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'corporate-legal', 'Corporate & Legal', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["LAWYER", "TAX_ACCOUNTANT", "BUSINESS_REGISTRATION_AGENT", "AUDITOR"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "bar_or_professional_body": { "type": "string" },
    "rate_type": { "type": "string", "enum": ["HOURLY", "FIXED", "RETAINER"] }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'tech-digital-services', 'Tech & Digital Services', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["WEB_DEVELOPER", "GRAPHIC_DESIGNER", "COPYWRITER", "MEDIA_BUYER", "APP_DEVELOPER", "SOCIAL_MEDIA_MANAGER"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "portfolio_url": { "type": "string" },
    "rate_type": { "type": "string", "enum": ["HOURLY", "FIXED", "RETAINER"] }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'b2b-procurement', 'B2B Procurement', id, 'SUPPLY_DEMAND', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "role": { "type": "string", "enum": ["RETAILER", "DISTRIBUTOR", "WHOLESALER", "MANUFACTURER"] },
    "product_categories": { "type": "array", "items": { "type": "string" } },
    "minimum_order_value_cents": { "type": "integer", "minimum": 0 },
    "delivery_coverage": { "type": "string" }
  },
  "required": ["role", "product_categories"]
}'::jsonb
FROM public.categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

-- ── Group 2: Education, Tutoring & Skill Exchange (mixed) ───────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'private-special-education', 'Private & Special Education', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "subject_specialities": { "type": "array", "items": { "type": "string" } },
    "level": { "type": "string", "enum": ["PRIMARY", "SECONDARY", "JAMB_PREP", "WAEC_PREP", "SAT_PREP", "CODING", "OTHER"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "mode": { "type": "string", "enum": ["IN_PERSON", "ONLINE", "HYBRID"] }
  },
  "required": ["subject_specialities", "level"]
}'::jsonb
FROM public.categories WHERE slug = 'education-tutoring-skill-exchange'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'vocational-training', 'Vocational Training', id, 'SUPPLY_DEMAND', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "trade": { "type": "string" },
    "apprenticeship_duration_months": { "type": "integer", "minimum": 0 },
    "stipend_provided": { "type": "boolean" },
    "certification_provided": { "type": "boolean" }
  },
  "required": ["trade"]
}'::jsonb
FROM public.categories WHERE slug = 'education-tutoring-skill-exchange'
ON CONFLICT (slug) DO NOTHING;

-- ── Group 3: Logistics, Haulage & Equipment Rental (mixed) ──────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'interstate-haulage-freight', 'Inter-State Haulage & Freight', id, 'SUPPLY_DEMAND', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "vehicle_type": { "type": "string", "enum": ["FLATBED", "BOX_TRUCK", "TANKER", "REFRIGERATED", "CONTAINER"] },
    "route_origin": { "type": "string" },
    "route_destination": { "type": "string" },
    "capacity_tons": { "type": "number", "minimum": 0 },
    "return_leg_available": { "type": "boolean" }
  },
  "required": ["vehicle_type", "route_origin", "route_destination"]
}'::jsonb
FROM public.categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'heavy-machinery-asset-leasing', 'Heavy Machinery & Asset Leasing', id, 'ASSET', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "equipment_type": { "type": "string", "enum": ["EXCAVATOR", "BULLDOZER", "CRANE", "GENERATOR", "FORKLIFT", "INDUSTRIAL_MACHINERY", "OTHER"] },
    "make": { "type": "string" },
    "condition": { "type": "string", "enum": ["NEW", "USED"] },
    "lease_term": { "type": "string", "enum": ["DAILY", "WEEKLY", "MONTHLY", "LONG_TERM"] },
    "operator_included": { "type": "boolean" }
  },
  "required": ["equipment_type", "lease_term"]
}'::jsonb
FROM public.categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'agricultural-logistics', 'Agricultural Logistics', id, 'SUPPLY_DEMAND', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["TRACTOR_OPERATOR", "COLD_STORAGE", "BULK_PRODUCE_BUYER", "FARM_TRANSPORT"] },
    "produce_type": { "type": "array", "items": { "type": "string" } },
    "capacity_tons": { "type": "number", "minimum": 0 },
    "location_region": { "type": "string" }
  },
  "required": ["service_type"]
}'::jsonb
FROM public.categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

-- ── Group 4: Events, Hospitality & Entertainment (mixed) ────────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'event-ecosystem', 'Event Ecosystem', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "vendor_type": { "type": "string", "enum": ["PHOTOGRAPHER", "CATERER", "DJ", "HALL_RENTAL", "DECOR", "SECURITY_BOUNCER", "MC", "LIVE_BAND"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "capacity_guests": { "type": "integer", "minimum": 0 },
    "rate_type": { "type": "string", "enum": ["PER_EVENT", "HOURLY", "PACKAGE"] }
  },
  "required": ["vendor_type"]
}'::jsonb
FROM public.categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;

-- NOTE: short-stay lodging itself already lives on the existing /hotels
-- vertical (separate table, not this dynamic catalog) - this subcategory is
-- scoped to the parts of "Shortlet & Experience Hosts" that vertical doesn't
-- cover: tour guides and private chefs. Flagged for your review in case you'd
-- rather fold shortlet listings into this catalog instead of the /hotels
-- table long-term (see the open decisions note from the last architecture doc).
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'experience-hosts', 'Shortlet & Experience Hosts', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "experience_type": { "type": "string", "enum": ["TOUR_GUIDE", "PRIVATE_CHEF", "LOCAL_EXPERIENCE_HOST"] },
    "languages": { "type": "array", "items": { "type": "string" } },
    "location_region": { "type": "string" },
    "rate_type": { "type": "string", "enum": ["PER_HOUR", "PER_DAY", "PER_EXPERIENCE"] }
  },
  "required": ["experience_type"]
}'::jsonb
FROM public.categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;

-- ── Group 5: Health, Wellness & Home Care (SERVICE) ─────────────────────────
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'in-home-healthcare', 'In-Home Healthcare', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "provider_type": { "type": "string", "enum": ["PRIVATE_NURSE", "ELDERLY_CARE", "PHYSIOTHERAPIST", "HOME_LAB_SAMPLE_COLLECTOR"] },
    "license_number": { "type": "string" },
    "years_experience": { "type": "integer", "minimum": 0 },
    "availability": { "type": "string", "enum": ["IMMEDIATE", "SCHEDULED", "LIVE_IN"] }
  },
  "required": ["provider_type"]
}'::jsonb
FROM public.categories WHERE slug = 'health-wellness-home-care'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT 'fitness-lifestyle', 'Fitness & Lifestyle', id, 'SERVICE', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "provider_type": { "type": "string", "enum": ["PERSONAL_TRAINER", "DIETITIAN", "WELLNESS_COACH"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "specialities": { "type": "array", "items": { "type": "string" } },
    "mode": { "type": "string", "enum": ["IN_PERSON", "ONLINE", "HYBRID"] }
  },
  "required": ["provider_type"]
}'::jsonb
FROM public.categories WHERE slug = 'health-wellness-home-care'
ON CONFLICT (slug) DO NOTHING;
