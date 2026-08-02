-- ============================================================================
-- ADR-007: Taxonomy Corrections (forum_categories): mirrors the catalog
-- migration, plus the Events/Real Estate shortlet-hosting fix.
-- ============================================================================

INSERT INTO public.forum_categories (slug, name, tagline, description, sort_order) VALUES
('automotive-machinery', 'Automotive & Machinery', 'Every Way to Buy, Sell, or Fix What Moves.', 'Cars, heavy machinery, and the services that keep them running.', 61)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'automotive-machinery')
WHERE slug = 'automotive';

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'automotive-machinery')
WHERE slug = 'heavy-machinery-asset-leasing';

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'auto-services-parts', 'Auto Services & Parts', 'Mechanics, panel beaters, tyre services, and parts dealers.', 3, id
FROM public.forum_categories WHERE slug = 'automotive-machinery'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, tagline, description, sort_order) VALUES
('skills-trades-daily-services', 'Skills, Trades & Daily Services', 'Every Proven Skill, Certificate Optional.', 'Home repairs, cleaning, beauty, cooking, and any daily skill you can prove.', 62)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'skills-trades-daily-services')
WHERE slug = 'artisans';

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'cleaning-moving-facility', 'Cleaning, Moving & Facility', 'Home and office cleaning, moving, and facility management.', 2, id
FROM public.forum_categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'beauty-grooming-personal-care', 'Beauty, Grooming & Personal Care', 'Hairstylists, barbers, makeup artists, and spa services.', 3, id
FROM public.forum_categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'cooking-catering-domestic', 'Cooking, Catering & Domestic', 'Private chefs, caterers, and domestic help.', 4, id
FROM public.forum_categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'creative-practical-skills', 'Creative & Practical Skills', 'Any proven daily skill, certificate optional.', 5, id
FROM public.forum_categories WHERE slug = 'skills-trades-daily-services'
ON CONFLICT (slug) DO NOTHING;

UPDATE public.forum_categories
SET name = 'Logistics & Mobility'
WHERE slug = 'logistics-haulage-equipment-rental';

-- ── Shortlet lodging moves from Events to Real Estate & Housing; Events gains
--    Photography/Videography/Content per the Blueprint ────────────────────
UPDATE public.forum_categories
SET parent_id = (SELECT id FROM public.forum_categories WHERE slug = 'real-estate-housing'),
    name = 'Experience Hosts',
    description = 'Tour guides and private chefs (short-stay lodging lives under Hotels & Shortlets).'
WHERE slug = 'experience-hosts';

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'photography-videography-content', 'Photography, Videography & Content', 'Event photographers, videographers, and content creators.', 2, id
FROM public.forum_categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;
