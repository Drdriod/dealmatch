-- ============================================================================
-- Forum Category Taxonomy Expansion
-- Mirrors 20260731000004_expand_category_taxonomy.sql so forum sections line
-- up with the dynamic-listing catalog groups. Additive only.
-- ============================================================================

ALTER TABLE public.forum_categories
  ADD COLUMN parent_id INT REFERENCES public.forum_categories(id) ON DELETE CASCADE;

CREATE INDEX idx_forum_categories_parent ON public.forum_categories(parent_id);

-- 'teachers' and 'corporate-services' forum sections are superseded by the
-- richer Education and Professional & Business Services groups below.
UPDATE public.forum_categories SET is_active = false WHERE slug IN ('teachers', 'corporate-services');

-- ── Parent groups ────────────────────────────────────────────────────────────
INSERT INTO public.forum_categories (slug, name, description, sort_order) VALUES
('professional-business-services', 'Professional & Business Services', 'Lawyers, accountants, freelancers, and B2B procurement for SMEs and startups.', 65),
('education-tutoring-skill-exchange', 'Education, Tutoring & Skill Exchange', 'Tutors, exam prep, coding instruction, and apprenticeship matching.', 66),
('logistics-haulage-equipment-rental', 'Logistics, Haulage & Equipment Rental', 'Freight, heavy machinery leasing, and agricultural logistics.', 67),
('events-hospitality-entertainment', 'Events, Hospitality & Entertainment', 'Event vendors, shortlet hosts, and local experience guides.', 68),
('health-wellness-home-care', 'Health, Wellness & Home Care', 'In-home healthcare and fitness/lifestyle providers.', 69)
ON CONFLICT (slug) DO NOTHING;

-- ── Children ─────────────────────────────────────────────────────────────────
INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'corporate-legal', 'Corporate & Legal', 'Lawyers, tax accountants, business registration, auditors.', 1, id
FROM public.forum_categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'tech-digital-services', 'Tech & Digital Services', 'Web/app developers, designers, copywriters, media buyers.', 2, id
FROM public.forum_categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'b2b-procurement', 'B2B Procurement', 'Retail shops sourcing directly from distributors and wholesalers.', 3, id
FROM public.forum_categories WHERE slug = 'professional-business-services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'private-special-education', 'Private & Special Education', 'Home tutors, JAMB/WAEC/SAT prep, coding instructors.', 1, id
FROM public.forum_categories WHERE slug = 'education-tutoring-skill-exchange'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'vocational-training', 'Vocational Training', 'Apprenticeship matching for technical trades.', 2, id
FROM public.forum_categories WHERE slug = 'education-tutoring-skill-exchange'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'interstate-haulage-freight', 'Inter-State Haulage & Freight', 'Cargo owners and return-leg truck drivers.', 1, id
FROM public.forum_categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'heavy-machinery-asset-leasing', 'Heavy Machinery & Asset Leasing', 'Excavators, generators, industrial equipment rentals.', 2, id
FROM public.forum_categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'agricultural-logistics', 'Agricultural Logistics', 'Tractor operators, cold storage, bulk produce buyers.', 3, id
FROM public.forum_categories WHERE slug = 'logistics-haulage-equipment-rental'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'event-ecosystem', 'Event Ecosystem', 'Photographers, caterers, DJs, hall rentals, decor, security.', 1, id
FROM public.forum_categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'experience-hosts', 'Shortlet & Experience Hosts', 'Tour guides and private chefs (short-stay lodging itself lives under Hotels & Shortlets).', 2, id
FROM public.forum_categories WHERE slug = 'events-hospitality-entertainment'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'in-home-healthcare', 'In-Home Healthcare', 'Private nurses, elderly care, physiotherapists, home lab collectors.', 1, id
FROM public.forum_categories WHERE slug = 'health-wellness-home-care'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.forum_categories (slug, name, description, sort_order, parent_id)
SELECT 'fitness-lifestyle', 'Fitness & Lifestyle', 'Personal trainers, dietitians, wellness coaches.', 2, id
FROM public.forum_categories WHERE slug = 'health-wellness-home-care'
ON CONFLICT (slug) DO NOTHING;
