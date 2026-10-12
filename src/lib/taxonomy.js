// Navigation taxonomy: two pillars, PLACE and PEOPLE.
// PLACE  = physical things a person buys, rents, leases or books.
// PEOPLE = humans providing work on demand.
//
// Navigation links to the two pillars only. Finding a specific group is done
// through Universal Search and the Forum, so groups are not listed here.
// The group tree itself lives in the database (see
// supabase/migrations/20261011010000_place_people_taxonomy.sql).

export const PILLARS = [
  { slug: 'place',  name: 'Place',  route: '/places' },
  { slug: 'people', name: 'People', route: '/providers' },
]

// PROVISIONAL grouping of the live top-level categories under each pillar.
// The approved taxonomy (supabase/migrations/20261011010000_place_people_taxonomy.sql)
// is parked, so production has no Place or People groups yet. When that
// migration is applied, replace these lists with its group slugs.
export const PILLAR_GROUPS = {
  place: [
    'real-estate',
    'student-hostels',
    'automotive-machinery',
    'logistics-haulage-equipment-rental',
    'events-hospitality-entertainment',
  ],
  people: [
    'skills-trades-daily-services',
    'health-wellness-home-care',
    'education-tutoring-skill-exchange',
    'professional-business-services',
    'professionals',
  ],
}

export function pillarHref(pillar) {
  return pillar.route
}

export function categoryHref(slug) {
  return `/category/${slug}`
}

// Which pillar a top-level category belongs to, or null.
export function pillarOfRoot(rootSlug) {
  if (PILLAR_GROUPS.place.includes(rootSlug)) return 'place'
  if (PILLAR_GROUPS.people.includes(rootSlug)) return 'people'
  return null
}

// True when the current path is inside this pillar's section.
export function isPillarActive(pillar, pathname) {
  return pathname === pillar.route || pathname.startsWith(pillar.route + '/')
}
