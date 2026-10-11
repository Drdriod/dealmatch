// Navigation taxonomy: two pillars, PLACE and PEOPLE.
// PLACE  = physical things a person buys, rents, leases or books.
// PEOPLE = humans providing work on demand.
//
// Mirrors supabase/migrations/20261011010000_place_people_taxonomy.sql.
// Keep the slugs identical to that migration. Pages filter by ?group=<slug>.

export const PILLARS = [
  {
    slug: 'place',
    name: 'Place',
    route: '/places',
    groups: [
      { slug: 'daily-stays', name: 'Daily Stays' },
      { slug: 'flexible-rentals', name: 'Flexible Rentals' },
      {
        slug: 'capital-assets',
        name: 'Capital & Assets',
        children: [
          { slug: 'land-plots', name: 'Land & Plots' },
          { slug: 'residential-sales', name: 'Residential Sales' },
          { slug: 'commercial-assets', name: 'Commercial Assets' },
          { slug: 'industrial-realty', name: 'Industrial Realty' },
          { slug: 'jv-distressed', name: 'Joint Ventures & Distressed' },
          { slug: 'automotive-machinery', name: 'Automotive & Machinery' },
        ],
      },
    ],
  },
  {
    slug: 'people',
    name: 'People',
    route: '/providers',
    groups: [
      { slug: 'skilled-trades', name: 'Skilled Trades' },
      { slug: 'tutors-coaches-care', name: 'Tutors, Coaches & Care' },
      { slug: 'property-home', name: 'Property & Home' },
      { slug: 'creatives-lifestyle', name: 'Creatives & Lifestyle' },
      { slug: 'licensed-experts', name: 'Licensed Experts' },
      { slug: 'advanced-skills', name: 'Advanced Skills' },
      { slug: 'logistics-haulage-equipment-rental', name: 'Moves & Logistics' },
    ],
  },
]

export function pillarHref(pillar) {
  return pillar.route
}

export function groupHref(pillar, group) {
  return `${pillar.route}?group=${group.slug}`
}

// True when the current path is inside this pillar's section.
export function isPillarActive(pillar, pathname) {
  return pathname === pillar.route || pathname.startsWith(pillar.route + '/')
}
