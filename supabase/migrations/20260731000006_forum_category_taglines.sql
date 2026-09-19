-- ============================================================================
-- Forum Category Taglines
-- Adds the approved landing-page copy (headline-style tagline, distinct from
-- the plain informational `description`) to every forum category. Additive
-- only. See the approved copywriting draft for source copy.
-- ============================================================================

ALTER TABLE public.forum_categories ADD COLUMN tagline VARCHAR(255);

COMMENT ON COLUMN public.forum_categories.tagline IS
  'Punchy landing-page headline (e.g. "Rent Without the Runaround"), '
  'rendered as the page H1. `name` stays the plain category label used in '
  'breadcrumbs, nav, and SEO <title> tags; `description` stays the '
  'supporting subhead line.';

UPDATE public.forum_categories SET tagline = 'Own It, Rent It, or Flip It.', description = 'Verified listings, real inspection status, and sellers who actually respond.' WHERE slug = 'real-estate';
UPDATE public.forum_categories SET tagline = 'Rent Without the Runaround.', description = 'Real tenancy terms upfront - no surprise agent fees at the door.' WHERE slug = 'rentals';
UPDATE public.forum_categories SET tagline = 'A Hostel Room, Not a Gamble.', description = 'See it, verify it, book it - before you show up with your bags.' WHERE slug = 'student-hostels';
UPDATE public.forum_categories SET tagline = 'Stay Somewhere Real.', description = 'Short stays with honest photos and hosts who confirm before you pay.' WHERE slug = 'hotels';
UPDATE public.forum_categories SET tagline = 'Work With Someone Who''s Actually Vetted.', description = 'Agents and inspectors with a track record you can check, not just a business card.' WHERE slug = 'professionals';
UPDATE public.forum_categories SET tagline = 'Hire the Plumber Who Actually Shows Up.', description = 'Rated, available, and matched to your job - not a random number off a signboard.' WHERE slug = 'artisans';
UPDATE public.forum_categories SET tagline = 'Buy the Car, Not the Story.', description = 'Real mileage, real condition, real sellers - matched to what you''re actually looking for.' WHERE slug = 'automotive';

UPDATE public.forum_categories SET tagline = 'Every Business Service You Need, Vetted Once, Used Often.', description = 'From your first contract to your tenth vendor - hire people who''ve done it before.' WHERE slug = 'professional-business-services';
UPDATE public.forum_categories SET tagline = 'Get the Paperwork Right the First Time.', description = 'Lawyers, tax accountants, and registration agents who know Nigerian compliance cold.' WHERE slug = 'corporate-legal';
UPDATE public.forum_categories SET tagline = 'Your Next Hire Could Be Your Best Hire.', description = 'Vetted developers, designers, and marketers - matched to the brief, not just a portfolio scroll.' WHERE slug = 'tech-digital-services';
UPDATE public.forum_categories SET tagline = 'Skip the Middleman Markup.', description = 'Retailers matched directly with distributors and wholesalers who actually stock what you need.' WHERE slug = 'b2b-procurement';

UPDATE public.forum_categories SET tagline = 'Learning Matched to the Person, Not a Classroom of 40.', description = 'Tutors, exam prep, and apprenticeships - matched to where you''re starting from.' WHERE slug = 'education-tutoring-skill-exchange';
UPDATE public.forum_categories SET tagline = 'JAMB, WAEC, or Just Catching Up.', description = 'Matched to a tutor who gets results.' WHERE slug = 'private-special-education';
UPDATE public.forum_categories SET tagline = 'A Real Trade, a Real Apprenticeship.', description = 'A real path to earning - matched to the trade you actually want.' WHERE slug = 'vocational-training';

UPDATE public.forum_categories SET tagline = 'Nothing Idle. Nothing Empty. Nothing Wasted.', description = 'Match empty trucks to waiting cargo, and idle equipment to the job that needs it.' WHERE slug = 'logistics-haulage-equipment-rental';
UPDATE public.forum_categories SET tagline = 'That Truck Heading Back Empty?', description = 'Someone''s cargo is waiting for exactly that route.' WHERE slug = 'interstate-haulage-freight';
UPDATE public.forum_categories SET tagline = 'Rent the Excavator for the Job, Not the Year.', description = 'Heavy machinery and industrial equipment, matched to the job length you actually need.' WHERE slug = 'heavy-machinery-asset-leasing';
UPDATE public.forum_categories SET tagline = 'From Farm to Buyer, Matched.', description = 'Tractors, cold storage, and bulk buyers who are actually ready.' WHERE slug = 'agricultural-logistics';

UPDATE public.forum_categories SET tagline = 'Every Vendor Your Event Needs, Matched at Once.', description = 'Photographers, caterers, DJs, and decor - matched to your date, budget, and guest count.' WHERE slug = 'events-hospitality-entertainment';
UPDATE public.forum_categories SET tagline = 'Stop Chasing Five Vendors on Five Different Apps.', description = 'Photographers, caterers, DJs, hall rentals, decor, and security - matched in one place.' WHERE slug = 'event-ecosystem';
UPDATE public.forum_categories SET tagline = 'A Private Chef, a Local Guide, an Experience Worth the Trip.', description = 'Tour guides and private chefs, matched to where you''re headed.' WHERE slug = 'experience-hosts';

UPDATE public.forum_categories SET tagline = 'Care That Comes to You, Vetted Before It Arrives.', description = 'Nurses, physiotherapists, and trainers - matched, checked, and ready when you are.' WHERE slug = 'health-wellness-home-care';
UPDATE public.forum_categories SET tagline = 'Home Care You''d Actually Trust.', description = 'Private nursing and elder care from people vetted before they ever reach your door.' WHERE slug = 'in-home-healthcare';
UPDATE public.forum_categories SET tagline = 'A Plan Matched to Your Goals, Not a Generic One.', description = 'Personal trainers, dietitians, and wellness coaches, matched to what you''re actually working toward.' WHERE slug = 'fitness-lifestyle';
