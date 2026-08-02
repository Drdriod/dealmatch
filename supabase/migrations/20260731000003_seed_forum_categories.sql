INSERT INTO public.forum_categories (slug, name, description, sort_order) VALUES
('real-estate',         'Real Estate',                'Buying, selling, and property advice across Nigeria.', 10),
('rentals',              'Rentals & Tenancy',          'Renting, landlords, tenancy agreements, and rent disputes.', 20),
('student-hostels',      'Student Hostels',            'Finding and living in student accommodation.', 30),
('hotels',               'Hotels & Shortlets',         'Short-stay bookings, hotel reviews, and travel questions.', 40),
('professionals',        'Real Estate Professionals',  'Working with agents, inspectors, and verified professionals.', 50),
('artisans',             'Skilled Artisans',           'Hiring plumbers, electricians, carpenters, and other tradespeople.', 60),
('corporate-services',   'Corporate Services',         'Legal, accounting, consulting, and other business services.', 70),
('automotive',           'Automotive',                 'Buying, selling, and maintaining vehicles.', 80),
('teachers',             'Talent & Teacher Recruitment','Hiring and job-seeking in education and other skilled roles.', 90),
('general',              'General Discussion',         'Anything else related to deals, matching, and the DealMatch community.', 100)
ON CONFLICT (slug) DO NOTHING;
