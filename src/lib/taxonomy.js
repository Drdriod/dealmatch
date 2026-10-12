// Navigation taxonomy: two pillars, PLACE and PEOPLE.
// PLACE  = physical things a person buys, rents, leases or books.
// PEOPLE = humans providing work on demand.
//
// The groups under each pillar come from the database, not from this file.
// Each top-level category has a `pillar` column ('place' or 'people'), set by
// supabase/migrations/20261012000000_taxonomy_blueprint_v2.sql.

export const PILLARS = [
  { slug: 'place',  name: 'Place',  route: '/places' },
  { slug: 'people', name: 'People', route: '/providers' },
]

export function pillarHref(pillar) {
  return pillar.route
}

export function categoryHref(slug) {
  return `/category/${slug}`
}

// True when the current path is inside this pillar's section.
export function isPillarActive(pillar, pathname) {
  return pathname === pillar.route || pathname.startsWith(pillar.route + '/')
}
