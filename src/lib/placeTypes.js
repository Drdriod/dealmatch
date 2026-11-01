// What the Places page shows and how each kind of listing is labelled.
// Pure functions, no database access, so they are unit tested.

export const PLACE_TYPES = ['All', 'Rental', 'Short-let', 'Buy', 'Land']

export const PLACE_TYPE_LABEL = {
  All: 'All',
  Rental: 'Rent',
  'Short-let': 'Short-let',
  Buy: 'Buy a home',
  Land: 'Land',
}

const SALE_WORDS = ['for sale', 'sale', 'joint venture', 'off-plan']

// The sale form stores category 'sale' and listing_type 'For Sale', 'Joint Venture' or 'Off-Plan'.
// Older code compared listing_type to the lowercase word 'sale', which never matched.
export function isSaleListing(property) {
  if (!property) return false
  if (property.category === 'sale') return true
  return SALE_WORDS.includes(String(property.listing_type || '').trim().toLowerCase())
}

// Which rows a tab asks the database for. `land` is 'only', 'exclude' or null.
export function placeFilter(type) {
  switch (type) {
    case 'Rental': return { categories: ['rental'], land: null }
    case 'Short-let': return { categories: ['shortlet'], land: null }
    case 'Buy': return { categories: ['sale'], land: 'exclude' }
    case 'Land': return { categories: ['sale'], land: 'only' }
    default: return { categories: ['rental', 'shortlet', 'sale'], land: null }
  }
}

export function placeBadge(property) {
  if (isSaleListing(property)) return property.property_type === 'land' ? 'Land' : 'For sale'
  return property?.category === 'shortlet' ? 'Short-let' : 'Rental'
}

export function priceSuffix(property) {
  if (isSaleListing(property)) return ''
  return property?.category === 'shortlet' ? ' / night' : ' / yr'
}

export function emptyListPath(type) {
  return type === 'Buy' || type === 'Land' ? '/list' : '/list-rental'
}
