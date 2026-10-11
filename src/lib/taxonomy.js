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

export function pillarHref(pillar) {
  return pillar.route
}

// True when the current path is inside this pillar's section.
export function isPillarActive(pillar, pathname) {
  return pathname === pillar.route || pathname.startsWith(pillar.route + '/')
}
