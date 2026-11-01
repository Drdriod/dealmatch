// Which Place subcategory a listing belongs to, and which People group a provider belongs to.
// Pure functions, no database access, so they are unit tested.
//
// The categories themselves live in the database (public.categories, see
// supabase/migrations/20261101000000_taxonomy_v3_merged.sql). These helpers only decide which
// subcategories the forms offer, and mirror the database's own fallback (fn_set_property_category_id)
// so the form's default and the database's default always agree.

// What the listing is, as the listing forms store it: category ('sale', 'rental', 'shortlet',
// 'hotel') and property_type ('land', 'apartment', 'duplex', 'detached', 'terrace', 'commercial').
const HOMES = ['homes-residential-sales', 'apartments-flats']
const COMMERCIAL = ['offices', 'shops-retail-spaces', 'warehouses', 'commercial-buildings', 'coworking-spaces']
const LAND = ['residential-land', 'commercial-land', 'agricultural-land']

// The subcategories a form offers for this listing, first one is the default.
export function subtypeOptions({ category, propertyType } = {}) {
  const cat = String(category || '').toLowerCase()
  const type = String(propertyType || '').toLowerCase()
  if (cat === 'hotel') return ['hotels-boutique-stays', 'guest-houses']
  if (cat === 'shortlet') return ['short-lets-vacation-stays', 'serviced-apartments', 'guest-houses']
  if (cat === 'rental') {
    if (type === 'commercial') return COMMERCIAL
    return type === 'apartment'
      ? ['apartments-flats', 'houses-for-rent', 'coliving-shared-apartments']
      : ['houses-for-rent', 'apartments-flats', 'coliving-shared-apartments']
  }
  if (cat === 'sale') {
    if (type === 'land') return LAND
    if (type === 'commercial') return ['commercial-buildings', 'offices', 'shops-retail-spaces', 'warehouses', 'coworking-spaces']
    if (type === 'apartment') return ['apartments-flats', 'homes-residential-sales']
    if (type === 'duplex' || type === 'detached' || type === 'terrace') return ['homes-residential-sales']
    return HOMES
  }
  return []
}

// The database's own default when the form sends nothing.
export function defaultSubtype(listing) {
  const cat = String(listing?.category || '').toLowerCase()
  const type = String(listing?.propertyType || '').toLowerCase()
  if (cat === 'hotel') return 'hotels-boutique-stays'
  if (cat === 'shortlet') return 'short-lets-vacation-stays'
  if (cat === 'rental') return type === 'apartment' ? 'apartments-flats' : type === 'commercial' ? 'commercial-buildings' : 'houses-for-rent'
  if (cat === 'sale') {
    if (type === 'land') return 'residential-land'
    if (type === 'commercial') return 'commercial-buildings'
    if (type === 'apartment') return 'apartments-flats'
    return 'homes-residential-sales'
  }
  return null
}

// Find a leaf (by slug) anywhere in the category tree. Returns the leaf or null.
export function findLeaf(tree, slug) {
  if (!tree || !slug) return null
  for (const group of tree) {
    const leaf = group.children?.find(c => c.slug === slug)
    if (leaf) return leaf
  }
  return null
}

// The offered subcategories as real rows from the tree (id + name), skipping any the database
// does not have or has switched off.
export function subtypeChoices(tree, listing) {
  return subtypeOptions(listing).map(slug => findLeaf(tree, slug)).filter(Boolean)
}

// People: the old provider "type" the rest of the app still reads (verification, search), taken
// from the group the provider picked.
const PEOPLE_GROUP_TYPE = {
  'trades-craftsmen': 'artisan',
  'education': 'tutor',
  'home-property-care': 'home_service',
  'licensed-experts': 'property_professional',
}
export function providerTypeForGroup(groupSlug) {
  return PEOPLE_GROUP_TYPE[groupSlug] || 'other_skill'
}

// The reverse: which group to open first when onboarding already told us the kind of work.
const TYPE_PEOPLE_GROUP = {
  artisan: 'trades-craftsmen',
  tutor: 'education',
  home_service: 'home-property-care',
  property_professional: 'licensed-experts',
}
export function groupForProviderType(type) {
  return TYPE_PEOPLE_GROUP[type] || ''
}

// Active People groups with their subcategories, in the order shown to the person.
export function peopleGroups(tree) {
  return (tree || [])
    .filter(g => g.pillar === 'people' && g.children?.length)
    .map(g => ({ ...g, children: [...g.children].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Active Place groups with their subcategories.
export function placeGroups(tree) {
  return (tree || [])
    .filter(g => g.pillar === 'place' && g.children?.length)
    .map(g => ({ ...g, children: [...g.children].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Leaf ids for a group slug or leaf slug, for the Places page filter. null means "no filter".
export function categoryIdsFor(tree, slug) {
  if (!slug) return null
  for (const group of tree || []) {
    if (group.slug === slug) return (group.children || []).map(c => c.id)
    const leaf = group.children?.find(c => c.slug === slug)
    if (leaf) return [leaf.id]
  }
  return []
}
