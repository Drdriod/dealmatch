-- ============================================================================
-- PLACE / PEOPLE taxonomy
-- Two pillars: PLACE = physical things bought, rented, leased or booked.
--              PEOPLE = humans providing work on demand.
-- Additive: new containers and leaves are inserted, existing rows are
-- re-parented by slug, nothing is deleted. Retired groups are deactivated.
-- Listings are NOT moved here. Sale listings still sit under real-estate
-- until they are reviewed and reassigned (separate step).
-- ============================================================================

-- 0. Fail loudly if an expected existing slug is missing in this database.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(s, ', ') INTO missing
  FROM unnest(ARRAY[
    'experience-hosts','real-estate','student-hostels','automotive-machinery',
    'heavy-machinery-asset-leasing','automotive','auto-services-parts','artisans',
    'professionals','cleaning-moving-facility','cooking-catering-domestic',
    'creative-practical-skills','beauty-grooming-personal-care','fitness-lifestyle',
    'event-ecosystem','corporate-legal','tech-digital-services','b2b-procurement',
    'private-special-education','vocational-training','in-home-healthcare',
    'logistics-haulage-equipment-rental','interstate-haulage-freight',
    'agricultural-logistics','skills-trades-daily-services',
    'education-tutoring-skill-exchange','professional-business-services',
    'events-hospitality-entertainment','health-wellness-home-care'
  ]) AS s
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = s);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'TAXONOMY_MISSING_SLUGS: %', missing;
  END IF;
END $$;

-- 1. Pillars
INSERT INTO public.categories (slug, name, attribute_schema, intent_filter) VALUES
  ('place',  'Place',  '{}'::jsonb, NULL),
  ('people', 'People', '{}'::jsonb, NULL)
ON CONFLICT (slug) DO NOTHING;

-- 2. Groups directly under the pillars
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT v.slug, v.name, p.id, NULL, '{}'::jsonb
FROM (VALUES
  ('daily-stays',          'Daily Stays',          'place'),
  ('flexible-rentals',     'Flexible Rentals',     'place'),
  ('capital-assets',       'Capital & Assets',     'place'),
  ('skilled-trades',       'Skilled Trades',       'people'),
  ('tutors-coaches-care',  'Tutors, Coaches & Care', 'people'),
  ('property-home',        'Property & Home',      'people'),
  ('creatives-lifestyle',  'Creatives & Lifestyle', 'people'),
  ('licensed-experts',     'Licensed Experts',     'people'),
  ('advanced-skills',      'Advanced Skills',      'people')
) AS v(slug, name, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- 3. Capital & Assets sub-groups
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT v.slug, v.name, p.id, NULL, '{}'::jsonb
FROM (VALUES
  ('land-plots',           'Land & Plots',                 'capital-assets'),
  ('residential-sales',    'Residential Sales',            'capital-assets'),
  ('commercial-assets',    'Commercial Assets',            'capital-assets'),
  ('industrial-realty',    'Industrial Realty',            'capital-assets'),
  ('jv-distressed',        'Joint Ventures & Distressed',  'capital-assets')
) AS v(slug, name, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- 4. New leaves for the Capital & Assets sub-groups (ASSET)
INSERT INTO public.categories (slug, name, parent_id, intent_filter, attribute_schema)
SELECT v.slug, v.name, p.id, 'ASSET', '{}'::jsonb
FROM (VALUES
  ('serviced-plots',    'Serviced Plots',     'land-plots'),
  ('commercial-plots',  'Commercial Plots',   'land-plots'),
  ('farm-acreage',      'Farm Acreage',       'land-plots'),
  ('off-plan-homes',    'Off-Plan Homes',     'residential-sales'),
  ('luxury-estates',    'Luxury Estates',     'residential-sales'),
  ('apartment-blocks',  'Apartment Blocks',   'residential-sales'),
  ('office-buildings',  'Office Buildings',   'commercial-assets'),
  ('retail-plazas',     'Retail Plazas',      'commercial-assets'),
  ('hotels-resorts',    'Hotels / Resorts',   'commercial-assets'),
  ('warehouses',        'Warehouses',         'industrial-realty'),
  ('industrial-yards',  'Industrial Yards',   'industrial-realty'),
  ('cold-storage',      'Cold Storage',       'industrial-realty'),
  ('jv-land-deals',     'JV Land Deals',      'jv-distressed'),
  ('bank-distressed',   'Bank Distressed',    'jv-distressed')
) AS v(slug, name, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- 5. Re-parent existing categories by slug (FK-safe: rows keep their ids).
UPDATE public.categories c
SET parent_id = p.id
FROM (VALUES
  ('experience-hosts',                  'daily-stays'),
  ('real-estate',                       'flexible-rentals'),
  ('student-hostels',                   'flexible-rentals'),
  ('automotive-machinery',              'capital-assets'),
  ('artisans',                          'skilled-trades'),
  ('auto-services-parts',               'skilled-trades'),
  ('private-special-education',         'tutors-coaches-care'),
  ('vocational-training',               'tutors-coaches-care'),
  ('in-home-healthcare',                'tutors-coaches-care'),
  ('professionals',                     'property-home'),
  ('cleaning-moving-facility',          'property-home'),
  ('cooking-catering-domestic',         'property-home'),
  ('creative-practical-skills',         'creatives-lifestyle'),
  ('beauty-grooming-personal-care',     'creatives-lifestyle'),
  ('fitness-lifestyle',                 'creatives-lifestyle'),
  ('event-ecosystem',                   'creatives-lifestyle'),
  ('corporate-legal',                   'licensed-experts'),
  ('tech-digital-services',             'advanced-skills'),
  ('b2b-procurement',                   'advanced-skills'),
  ('logistics-haulage-equipment-rental','people'),
  ('interstate-haulage-freight',        'logistics-haulage-equipment-rental'),
  ('agricultural-logistics',            'logistics-haulage-equipment-rental')
) AS v(child_slug, parent_slug)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE c.slug = v.child_slug;

-- 6. Diagram label for the moved logistics group.
UPDATE public.categories SET name = 'Moves & Logistics'
WHERE slug = 'logistics-haulage-equipment-rental';

-- 7. Retire the old parent groups. Their children were moved above, and the
--    check below stops the migration if any active child is still under them.
UPDATE public.categories SET is_active = false
WHERE slug IN (
  'skills-trades-daily-services',
  'education-tutoring-skill-exchange',
  'professional-business-services',
  'events-hospitality-entertainment',
  'health-wellness-home-care'
);

DO $$
DECLARE
  stranded integer;
BEGIN
  SELECT count(*) INTO stranded
  FROM public.categories c
  JOIN public.categories g ON g.id = c.parent_id
  WHERE g.slug IN (
          'skills-trades-daily-services',
          'education-tutoring-skill-exchange',
          'professional-business-services',
          'events-hospitality-entertainment',
          'health-wellness-home-care'
        )
    AND c.is_active;

  IF stranded > 0 THEN
    RAISE EXCEPTION 'TAXONOMY_STRANDED_CHILDREN: % active categories still under retired groups', stranded;
  END IF;
END $$;
