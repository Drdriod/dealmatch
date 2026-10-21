-- ============================================================================
-- Taxonomy v2: Place and People, as the approved blueprint defines them.
--
-- Supersedes the parked 20261011010000_place_people_taxonomy.sql, which does
-- not match the blueprint (it uses different group names and only 3 of its
-- slugs are in the blueprint). That file stays parked and unapplied.
--
-- Structure: two levels, the same shape the app already reads.
--   * A GROUP is a top-level row (parent_id NULL) with a pillar.
--   * A LEAF is a child row under exactly one group.
--   * pillar ('place' or 'people') is stored on every active row, so the
--     navbar reads the database instead of a hand-written list.
--
-- Safe on both databases:
--   * production: 31 categories, no pillar column yet.
--   * staging: already holds the parked groups (place, people, daily-stays...).
-- Every write is an upsert by slug. Nothing is deleted. Rows outside the
-- blueprint are deactivated, not removed. The migration refuses to run if a
-- listing would be left under a category it is about to deactivate.
-- ============================================================================

-- 1. Pillar column ----------------------------------------------------------
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS pillar TEXT;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_pillar_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_pillar_check CHECK (pillar IS NULL OR pillar IN ('place', 'people'));

-- 2. Groups (top level) -----------------------------------------------------
INSERT INTO public.categories (slug, name, parent_id, pillar, is_active, attribute_schema)
VALUES
  ('flexible-stays',              'Flexible Stays & Hospitality',       NULL, 'place',  true, '{}'::jsonb),
  ('residential-rentals',         'Residential Rentals & Spaces',       NULL, 'place',  true, '{}'::jsonb),
  ('capital-property-assets',     'Capital & Property Sales & Assets',  NULL, 'place',  true, '{}'::jsonb),
  ('logistics-haulage-equipment', 'Logistics, Haulage & Equipment',     NULL, 'place',  true, '{}'::jsonb),
  ('trades-craftsmen',            'Trades & Craftsmen',                 NULL, 'people', true, '{}'::jsonb),
  ('tutors-coaches',              'Tutors & Coaches',                   NULL, 'people', true, '{}'::jsonb),
  ('home-property-care',          'Home & Property Care',               NULL, 'people', true, '{}'::jsonb),
  ('creatives-lifestyle',         'Creatives & Lifestyle',              NULL, 'people', true, '{}'::jsonb),
  ('licensed-experts',            'Licensed Experts',                   NULL, 'people', true, '{}'::jsonb),
  ('professional-business-services', 'Professional & Business Services', NULL, 'people', true, '{}'::jsonb),
  ('auto-logistics-talent',       'Auto Services & Logistics Talent',   NULL, 'people', true, '{}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      parent_id = NULL,
      pillar = EXCLUDED.pillar,
      is_active = true;

-- 3. Leaves (children). Existing leaves keep their name and id; only the
--    parent and pillar change. New leaves are created.
WITH leaves(slug, name, grp) AS (
  VALUES
    -- Place: flexible stays
    ('short-lets-serviced-apartments', 'Short-Lets & Serviced Apartments', 'flexible-stays'),
    ('hotels-boutique-stays',          'Hotels & Boutique Stays',          'flexible-stays'),
    ('executive-extended-stays',       'Executive & Extended Stays',       'flexible-stays'),
    ('event-venues-coworking',         'Event Venues & Co-Working Spaces', 'flexible-stays'),
    ('experience-hosts',               'Shortlet & Experience Hosts',      'flexible-stays'),
    -- Place: residential rentals
    ('monthly-rentals',                'Monthly Rentals',                  'residential-rentals'),
    ('annual-leases',                  'Annual Leases',                    'residential-rentals'),
    ('coliving-shared-apartments',     'Co-Living & Shared Apartments',    'residential-rentals'),
    ('student-hostels',                'Student Hostels',                  'residential-rentals'),
    -- Place: capital & property sales and assets
    ('homes-residential-sales',        'Homes & Residential Sales',        'capital-property-assets'),
    ('off-plan-developer-projects',    'Off-Plan Developer Projects',      'capital-property-assets'),
    ('verified-land-plots',            'Verified Land & Plots',            'capital-property-assets'),
    ('commercial-real-estate-warehouses', 'Commercial Real Estate & Warehouses', 'capital-property-assets'),
    ('joint-ventures-distressed-deals', 'Joint Ventures & Distressed Deals', 'capital-property-assets'),
    ('automotive',                     'Automotive',                       'capital-property-assets'),
    ('heavy-machinery-asset-leasing',  'Heavy Machinery & Asset Leasing',  'capital-property-assets'),
    -- Place: logistics, haulage & equipment
    ('interstate-haulage-freight',     'Inter-State Haulage & Freight',    'logistics-haulage-equipment'),
    ('agricultural-logistics',         'Agricultural Logistics',           'logistics-haulage-equipment'),
    ('home-office-relocation',         'Home & Office Relocation Movement', 'logistics-haulage-equipment'),
    -- People: trades & craftsmen
    ('artisans',                       'Skilled Artisans',                 'trades-craftsmen'),
    ('carpenters-woodworkers',         'Carpenters & Woodworkers',         'trades-craftsmen'),
    ('painters-decorators',            'Painters & Decorators',            'trades-craftsmen'),
    ('tilers-flooring',                'Tilers & Flooring Specialists',    'trades-craftsmen'),
    ('welders-fabricators',            'Welders & Metal Fabricators',      'trades-craftsmen'),
    ('masons-pop-technicians',         'Masons, Bricklayers & POP Technicians', 'trades-craftsmen'),
    ('tailors-fashion-designers',      'Tailors & Fashion Designers',      'trades-craftsmen'),
    ('creative-practical-skills',      'Creative & Practical Skills',      'trades-craftsmen'),
    -- People: tutors & coaches
    ('academic-home-tutors',           'Academic & Home Lesson Tutors',    'tutors-coaches'),
    ('tech-coding-tutors',             'Tech, Coding & Digital Skills Tutors', 'tutors-coaches'),
    ('music-instructors',              'Music & Instrument Instructors',   'tutors-coaches'),
    ('fitness-trainers',               'Fitness Trainers & Sports Coaches', 'tutors-coaches'),
    ('language-vocational-tutors',     'Language & Vocational Tutors',     'tutors-coaches'),
    ('private-special-education',      'Private & Special Education',      'tutors-coaches'),
    ('vocational-training',            'Vocational Training',              'tutors-coaches'),
    ('fitness-lifestyle',              'Fitness & Lifestyle',              'tutors-coaches'),
    -- People: home & property care
    ('turnover-cleaners-housekeepers', 'Short-Let Turnover Cleaners & Housekeepers', 'home-property-care'),
    ('electricians-solar-inverter',    'Electricians, Solar & Inverter Technicians', 'home-property-care'),
    ('ac-technicians-plumbers',        'AC Technicians & Plumbers',        'home-property-care'),
    ('generator-mechanics',            'Generator Mechanics & Technicians', 'home-property-care'),
    ('cooks-nannies-caregivers',       'Cooks, Nannies & Caregivers',      'home-property-care'),
    ('security-personnel',             'Security Personnel & Gatekeepers', 'home-property-care'),
    ('in-home-healthcare',             'In-Home Healthcare',               'home-property-care'),
    ('cleaning-moving-facility',       'Cleaning, Moving & Facility',      'home-property-care'),
    ('cooking-catering-domestic',      'Cooking, Catering & Domestic',     'home-property-care'),
    -- People: creatives & lifestyle
    ('photographers-videographers',    'Photographers & Videographers',    'creatives-lifestyle'),
    ('muas-barbers-stylists',          'Makeup Artists, Barbers & Stylists', 'creatives-lifestyle'),
    ('event-planners-caterers',        'Event Planners, Caterers & Bakers', 'creatives-lifestyle'),
    ('djs-mcs-sound-engineers',        'DJs, MCs & Sound Engineers',       'creatives-lifestyle'),
    ('beauty-grooming-personal-care',  'Beauty, Grooming & Personal Care', 'creatives-lifestyle'),
    ('event-ecosystem',                'Event Ecosystem',                  'creatives-lifestyle'),
    -- People: licensed experts
    ('real-estate-attorneys',          'Real Estate Attorneys & Title Lawyers', 'licensed-experts'),
    ('registered-land-surveyors',      'SURCON Registered Land Surveyors', 'licensed-experts'),
    ('valuation-surveyors-engineers',  'NIESV Valuation Surveyors & Civil Engineers', 'licensed-experts'),
    ('architects-building-consultants', 'Architects & Building Consultants', 'licensed-experts'),
    ('corporate-legal',                'Corporate & Legal',                'licensed-experts'),
    ('professionals',                  'Real Estate Professionals',        'licensed-experts'),
    -- People: professional & business services (existing tree, kept)
    ('b2b-procurement',                'B2B Procurement',                  'professional-business-services'),
    ('tech-digital-services',          'Tech & Digital Services',          'professional-business-services'),
    -- People: auto services & logistics talent
    ('auto-services-parts',            'Auto Mechanics, Auto Electricians & Panel Beaters', 'auto-logistics-talent'),
    ('drivers-machinery-operators',    'Pro Drivers, Haulage Drivers & Heavy Equipment Operators', 'auto-logistics-talent')
)
INSERT INTO public.categories (slug, name, parent_id, pillar, is_active, attribute_schema)
SELECT l.slug, l.name, g.id, g.pillar, true, '{}'::jsonb
FROM leaves l
JOIN public.categories g ON g.slug = l.grp AND g.parent_id IS NULL
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id,
      pillar = EXCLUDED.pillar,
      is_active = true;

-- 4. Refuse to deactivate a category that still has listings ---------------
DO $$
DECLARE
  v_orphaned integer;
BEGIN
  SELECT count(*) INTO v_orphaned
    FROM public.category_listings cl
    JOIN public.categories c ON c.id = cl.category_id
   WHERE c.is_active AND c.pillar IS NULL;

  IF v_orphaned > 0 THEN
    RAISE EXCEPTION 'TAXONOMY_LISTINGS_UNDER_RETIRED_CATEGORIES: % listing(s) would be orphaned. Move them first.', v_orphaned;
  END IF;
END
$$;

-- 5. Deactivate everything outside the blueprint. Rows that are in the
--    blueprint all have a pillar set above; everything else has none.
UPDATE public.categories
   SET is_active = false,
       pillar = NULL
 WHERE is_active = true
   AND pillar IS NULL;

-- 6. Properties can belong to a category, so Place pages can list them.
--    Nullable, no backfill: existing properties stay unassigned until set.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_category_id ON public.properties (category_id);

-- 7. Check the result. Fails loudly if the tree is not the blueprint shape.
DO $$
DECLARE
  v_groups integer;
  v_leaves integer;
  v_bad_leaves integer;
BEGIN
  SELECT count(*) INTO v_groups
    FROM public.categories WHERE is_active AND parent_id IS NULL AND pillar IS NOT NULL;
  SELECT count(*) INTO v_leaves
    FROM public.categories WHERE is_active AND parent_id IS NOT NULL;
  SELECT count(*) INTO v_bad_leaves
    FROM public.categories k
    JOIN public.categories g ON g.id = k.parent_id
   WHERE k.is_active AND (g.parent_id IS NOT NULL OR g.pillar IS DISTINCT FROM k.pillar);

  IF v_groups <> 11 THEN
    RAISE EXCEPTION 'TAXONOMY_GROUP_COUNT: expected 11 active groups, found %', v_groups;
  END IF;
  IF v_leaves <> 60 THEN
    RAISE EXCEPTION 'TAXONOMY_LEAF_COUNT: expected 60 active leaves, found %', v_leaves;
  END IF;
  IF v_bad_leaves <> 0 THEN
    RAISE EXCEPTION 'TAXONOMY_BAD_LEAVES: % leaf/leaves are not under a group of the same pillar', v_bad_leaves;
  END IF;
END
$$;
