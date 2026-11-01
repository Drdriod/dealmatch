-- ============================================================================
-- Taxonomy v3: the merged Place and People structure the owner approved.
--
--   PLACE  (5 groups, 21 leaves)  what a place IS: residential, commercial,
--                                 land, hospitality, event and recreation.
--          How it is offered (rent, short-let, sale, joint venture, off-plan)
--          stays on the listing itself (properties.category / listing_type),
--          so it is a filter, not a category.
--   PEOPLE (10 groups, 50 leaves)
--
-- Replaces the v2 blueprint (20261012000000_taxonomy_blueprint_v2.sql).
-- Same shape the app already reads: group = top-level row with a pillar,
-- leaf = child row under exactly one group.
--
-- Safe to run more than once, and on production and staging:
--   * every write is an upsert by slug; nothing is deleted;
--   * rows outside this structure are deactivated, not removed;
--   * the migration refuses to run if a property or category listing would be
--     left on a category it is about to retire. (Providers are matched by the
--     category NAME they typed or picked, not by id, so they are not affected.)
-- ============================================================================

-- 0. Columns (already present where v2 ran; kept so this file stands alone) --
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS pillar TEXT;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_pillar_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_pillar_check CHECK (pillar IS NULL OR pillar IN ('place', 'people'));

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES public.categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_properties_category_id ON public.properties (category_id);

-- 1. Groups -----------------------------------------------------------------
INSERT INTO public.categories (slug, name, parent_id, pillar, is_active, attribute_schema)
VALUES
  ('residential-properties',         'Residential Properties',              NULL, 'place',  true, '{}'::jsonb),
  ('commercial-properties',          'Commercial Properties',               NULL, 'place',  true, '{}'::jsonb),
  ('land-and-plots',                 'Land & Plots',                        NULL, 'place',  true, '{}'::jsonb),
  ('hospitality-stays',              'Hospitality & Accommodation',         NULL, 'place',  true, '{}'::jsonb),
  ('event-recreation-spaces',        'Event & Recreation Spaces',           NULL, 'place',  true, '{}'::jsonb),
  ('auto-services',                  'Auto Services',                       NULL, 'people', true, '{}'::jsonb),
  ('creatives-lifestyle',            'Creativity & Lifestyle',              NULL, 'people', true, '{}'::jsonb),
  ('home-property-care',             'Home & Property Care',                NULL, 'people', true, '{}'::jsonb),
  ('trades-craftsmen',               'Trades & Craftsmen',                  NULL, 'people', true, '{}'::jsonb),
  ('licensed-experts',               'Licensed Experts',                    NULL, 'people', true, '{}'::jsonb),
  ('professional-business-services', 'Professional & Business Services',    NULL, 'people', true, '{}'::jsonb),
  ('logistics-mobility',             'Logistics & Mobility',                NULL, 'people', true, '{}'::jsonb),
  ('education',                      'Education',                           NULL, 'people', true, '{}'::jsonb),
  ('events',                         'Events',                              NULL, 'people', true, '{}'::jsonb),
  ('health-wellness',                'Health & Wellness',                   NULL, 'people', true, '{}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      parent_id = NULL,
      pillar = EXCLUDED.pillar,
      is_active = true;

-- 2. Leaves -----------------------------------------------------------------
-- Existing leaves keep their id (slug unchanged); only name, parent and pillar
-- are updated. New leaves are created.
CREATE TEMP TABLE _taxonomy_v3_leaves (slug text PRIMARY KEY, name text NOT NULL, grp text NOT NULL) ON COMMIT DROP;

INSERT INTO _taxonomy_v3_leaves (slug, name, grp) VALUES
  -- Place: Residential Properties
  ('homes-residential-sales',        'Houses for Sale',                   'residential-properties'),
  ('houses-for-rent',                'Houses for Rent',                   'residential-properties'),
  ('apartments-flats',               'Apartments & Flats',                'residential-properties'),
  ('student-hostels',                'Student Hostels',                   'residential-properties'),
  ('coliving-shared-apartments',     'Co-Living & Shared Apartments',     'residential-properties'),
  -- Place: Commercial Properties
  ('offices',                        'Offices',                           'commercial-properties'),
  ('shops-retail-spaces',            'Shops & Retail Spaces',             'commercial-properties'),
  ('warehouses',                     'Warehouses',                        'commercial-properties'),
  ('commercial-buildings',           'Commercial Buildings',              'commercial-properties'),
  ('coworking-spaces',               'Co-Working Spaces',                 'commercial-properties'),
  -- Place: Land & Plots
  ('residential-land',               'Residential Land',                  'land-and-plots'),
  ('commercial-land',                'Commercial Land',                   'land-and-plots'),
  ('agricultural-land',              'Agricultural Land',                 'land-and-plots'),
  -- Place: Hospitality & Accommodation
  ('hotels-boutique-stays',          'Hotels & Boutique Stays',           'hospitality-stays'),
  ('guest-houses',                   'Guest Houses',                      'hospitality-stays'),
  ('serviced-apartments',            'Serviced Apartments',               'hospitality-stays'),
  ('short-lets-vacation-stays',      'Short-lets & Vacation Stays',       'hospitality-stays'),
  -- Place: Event & Recreation Spaces
  ('event-centres',                  'Event Centres',                     'event-recreation-spaces'),
  ('conference-halls',               'Conference Halls',                  'event-recreation-spaces'),
  ('outdoor-venues',                 'Outdoor Venues',                    'event-recreation-spaces'),
  ('recreational-facilities',        'Recreational Facilities',           'event-recreation-spaces'),
  -- People: Auto Services
  ('vehicle-repair-diagnostics',     'Vehicle Repair & Diagnostics',      'auto-services'),
  ('auto-services-parts',            'Auto Maintenance, Parts & Services','auto-services'),
  -- People: Creativity & Lifestyle
  ('photographers-videographers',    'Photographers & Videographers',     'creatives-lifestyle'),
  ('designers',                      'Designers',                         'creatives-lifestyle'),
  ('beauty-grooming-personal-care',  'Beauty, Grooming & Personal Care',  'creatives-lifestyle'),
  ('muas-barbers-stylists',          'Makeup Artists, Barbers & Stylists','creatives-lifestyle'),
  ('tailors-fashion-designers',      'Tailors & Fashion Designers',       'creatives-lifestyle'),
  -- People: Home & Property Care
  ('ac-technicians-plumbers',        'AC Technicians & Plumbers',         'home-property-care'),
  ('electricians-solar-inverter',    'Electricians, Solar & Inverter Technicians', 'home-property-care'),
  ('generator-mechanics',            'Generator Mechanics & Technicians', 'home-property-care'),
  ('cleaning-moving-facility',       'Cleaning & Facility Services',      'home-property-care'),
  ('turnover-cleaners-housekeepers', 'Short-Let Turnover Cleaners & Housekeepers', 'home-property-care'),
  ('security-personnel',             'Security Personnel & Gatekeepers',  'home-property-care'),
  ('cooks-nannies-caregivers',       'Cooks, Nannies, Caregivers & Domestic Help', 'home-property-care'),
  ('maintenance-handymen',           'Maintenance & Handymen',            'home-property-care'),
  -- People: Trades & Craftsmen
  ('masons-pop-technicians',         'Masons, Bricklayers & POP Technicians', 'trades-craftsmen'),
  ('carpenters-woodworkers',         'Carpenters & Woodworkers',          'trades-craftsmen'),
  ('painters-decorators',            'Painters & Decorators',             'trades-craftsmen'),
  ('tilers-flooring',                'Tilers & Flooring Specialists',     'trades-craftsmen'),
  ('welders-fabricators',            'Welders & Metal Fabricators',       'trades-craftsmen'),
  ('artisans',                       'Skilled Artisans',                  'trades-craftsmen'),
  -- People: Licensed Experts
  ('architects-building-consultants','Architects & Building Consultants', 'licensed-experts'),
  ('valuation-surveyors-engineers',  'NIESV Valuation Surveyors',         'licensed-experts'),
  ('registered-land-surveyors',      'SURCON Registered Land Surveyors',  'licensed-experts'),
  ('civil-engineers',                'Civil Engineers',                   'licensed-experts'),
  ('real-estate-attorneys',          'Real Estate Attorneys & Title Lawyers', 'licensed-experts'),
  ('corporate-legal',                'Corporate & Legal',                 'licensed-experts'),
  ('other-licensed-professions',     'Other Licensed Professions',        'licensed-experts'),
  -- People: Professional & Business Services
  ('consulting',                     'Consulting',                        'professional-business-services'),
  ('accounting',                     'Accounting',                        'professional-business-services'),
  ('business-support',               'Business Support',                  'professional-business-services'),
  ('b2b-procurement',                'B2B Procurement',                   'professional-business-services'),
  ('tech-digital-services',          'Tech & Digital Services',           'professional-business-services'),
  ('professionals',                  'Real Estate Professionals',         'professional-business-services'),
  -- People: Logistics & Mobility
  ('drivers-machinery-operators',    'Pro Drivers, Haulage Drivers & Heavy Equipment Operators', 'logistics-mobility'),
  ('delivery',                       'Delivery',                          'logistics-mobility'),
  ('home-office-relocation',         'Home & Office Relocation',          'logistics-mobility'),
  ('interstate-haulage-freight',     'Inter-State Haulage & Freight',     'logistics-mobility'),
  ('agricultural-logistics',         'Agricultural Logistics',            'logistics-mobility'),
  -- People: Education
  ('academic-home-tutors',           'Academic & Home Lesson Tutors',     'education'),
  ('training',                       'Training',                          'education'),
  ('coaching',                       'Coaching',                          'education'),
  -- People: Events
  ('event-planners',                 'Event Planners',                    'events'),
  ('caterers-bakers',                'Caterers & Bakers',                 'events'),
  ('djs-mcs-sound-engineers',        'DJs, MCs & Sound Engineers',        'events'),
  ('event-coordination',             'Event Coordination',                'events'),
  -- People: Health & Wellness
  ('fitness-trainers',               'Fitness Trainers & Sports Coaches', 'health-wellness'),
  ('wellness',                       'Wellness',                          'health-wellness'),
  ('in-home-healthcare',             'In-Home Healthcare',                'health-wellness'),
  ('health-professionals',           'Health Professionals',              'health-wellness');

INSERT INTO public.categories (slug, name, parent_id, pillar, is_active, attribute_schema)
SELECT l.slug, l.name, g.id, g.pillar, true, '{}'::jsonb
  FROM _taxonomy_v3_leaves l
  JOIN public.categories g ON g.slug = l.grp AND g.parent_id IS NULL
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      parent_id = EXCLUDED.parent_id,
      pillar = EXCLUDED.pillar,
      is_active = true;

-- 3. Retire everything outside this structure, after checking nothing uses it
CREATE TEMP TABLE _taxonomy_v3_keep (slug text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _taxonomy_v3_keep
  SELECT slug FROM _taxonomy_v3_leaves
  UNION ALL SELECT slug FROM public.categories
   WHERE parent_id IS NULL AND is_active AND pillar IS NOT NULL
     AND slug IN ('residential-properties','commercial-properties','land-and-plots','hospitality-stays',
                  'event-recreation-spaces','auto-services','creatives-lifestyle','home-property-care',
                  'trades-craftsmen','licensed-experts','professional-business-services','logistics-mobility',
                  'education','events','health-wellness');

DO $$
DECLARE
  v_props integer;
  v_listings integer;
BEGIN
  SELECT count(*) INTO v_props
    FROM public.properties p
    JOIN public.categories c ON c.id = p.category_id
   WHERE c.is_active AND c.slug NOT IN (SELECT slug FROM _taxonomy_v3_keep);

  SELECT count(*) INTO v_listings
    FROM public.category_listings cl
    JOIN public.categories c ON c.id = cl.category_id
   WHERE c.is_active AND c.slug NOT IN (SELECT slug FROM _taxonomy_v3_keep);

  IF v_props > 0 OR v_listings > 0 THEN
    RAISE EXCEPTION 'TAXONOMY_V3_ROWS_UNDER_RETIRED_CATEGORIES: % propert(ies) and % listing(s) would be orphaned. Move them first.', v_props, v_listings;
  END IF;
END
$$;

UPDATE public.categories
   SET is_active = false,
       pillar = NULL
 WHERE is_active = true
   AND slug NOT IN (SELECT slug FROM _taxonomy_v3_keep);

-- 4. Properties pick up their category automatically ----------------------
-- Replaces the v2 trigger (which pointed at retired slugs). Rules:
--   * a category_id the form sent is kept only if it is an active PLACE leaf;
--     anything else (a people category, a group, a retired row) is cleared, so
--     a client can never file a place under the wrong pillar;
--   * an empty category_id is derived from category + property_type:
--       hotel -> hotels-boutique-stays      shortlet -> short-lets-vacation-stays
--       rental: apartment -> apartments-flats, commercial -> commercial-buildings,
--               anything else -> houses-for-rent
--       sale:   land -> residential-land, commercial -> commercial-buildings,
--               apartment -> apartments-flats, anything else -> homes-residential-sales
--   * an unknown word leaves category_id empty; nothing fails.
CREATE OR REPLACE FUNCTION public.fn_set_property_category_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_cat  text := lower(btrim(coalesce(NEW.category::text, '')));
  v_type text := lower(btrim(coalesce(NEW.property_type::text, '')));
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.categories c
       WHERE c.id = NEW.category_id
         AND COALESCE(c.is_active, true)
         AND c.pillar = 'place'
         AND c.parent_id IS NOT NULL
    ) THEN
      RETURN NEW;
    END IF;
    NEW.category_id := NULL;
  END IF;

  v_slug := CASE v_cat
    WHEN 'hotel'    THEN 'hotels-boutique-stays'
    WHEN 'shortlet' THEN 'short-lets-vacation-stays'
    WHEN 'rental'   THEN CASE v_type
                           WHEN 'apartment'  THEN 'apartments-flats'
                           WHEN 'commercial' THEN 'commercial-buildings'
                           ELSE 'houses-for-rent'
                         END
    WHEN 'sale'     THEN CASE v_type
                           WHEN 'land'       THEN 'residential-land'
                           WHEN 'commercial' THEN 'commercial-buildings'
                           WHEN 'apartment'  THEN 'apartments-flats'
                           ELSE 'homes-residential-sales'
                         END
    ELSE NULL
  END;

  IF v_slug IS NOT NULL THEN
    SELECT c.id INTO NEW.category_id
      FROM public.categories c
     WHERE c.slug = v_slug AND COALESCE(c.is_active, true);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_property_category_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_set_property_category_id
  BEFORE INSERT OR UPDATE OF category, property_type, category_id ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_property_category_id();

-- 5. Check the result. Fails loudly if the tree is not the approved shape.
DO $$
DECLARE
  v_place_groups integer;
  v_people_groups integer;
  v_leaves integer;
  v_bad_leaves integer;
BEGIN
  SELECT count(*) INTO v_place_groups
    FROM public.categories WHERE is_active AND parent_id IS NULL AND pillar = 'place';
  SELECT count(*) INTO v_people_groups
    FROM public.categories WHERE is_active AND parent_id IS NULL AND pillar = 'people';
  SELECT count(*) INTO v_leaves
    FROM public.categories WHERE is_active AND parent_id IS NOT NULL;
  SELECT count(*) INTO v_bad_leaves
    FROM public.categories k
    JOIN public.categories g ON g.id = k.parent_id
   WHERE k.is_active AND (g.parent_id IS NOT NULL OR g.pillar IS DISTINCT FROM k.pillar OR NOT g.is_active);

  IF v_place_groups <> 5 THEN
    RAISE EXCEPTION 'TAXONOMY_V3_PLACE_GROUPS: expected 5, found %', v_place_groups;
  END IF;
  IF v_people_groups <> 10 THEN
    RAISE EXCEPTION 'TAXONOMY_V3_PEOPLE_GROUPS: expected 10, found %', v_people_groups;
  END IF;
  IF v_leaves <> 71 THEN
    RAISE EXCEPTION 'TAXONOMY_V3_LEAF_COUNT: expected 71 active leaves, found %', v_leaves;
  END IF;
  IF v_bad_leaves <> 0 THEN
    RAISE EXCEPTION 'TAXONOMY_V3_BAD_LEAVES: % leaf/leaves are not under an active group of the same pillar', v_bad_leaves;
  END IF;
END
$$;
