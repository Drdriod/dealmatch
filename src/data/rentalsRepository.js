// Repository (structural pattern) for browsing rentals and short-lets (RentalsPage), and for
// posting a rental (ListRentalPage). The pages call these and never build a query.
import { supabase } from '@/lib/supabase'
import { PROPERTY_PUBLIC_COLUMNS } from '@/lib/propertyColumns'
import { insertListingWithPhotos } from '@/lib/listingWrite'
import { placeFilter } from '@/lib/placeTypes'

// Active places for the Places page: rentals, short-lets and properties for sale (homes and land),
// newest first, at most 40. Rentals and short-lets marked occupied are hidden so nobody double-books;
// a null occupancy is an older listing and counts as vacant. A home for sale is often lived in, so
// the occupancy rule does not apply to sales.
// `type` is one of PLACE_TYPES. 'All States' means no state filter.
export function fetchActivePlaces(type, state) {
  const { categories, land } = placeFilter(type)
  // Named public columns: this list is open to anonymous visitors (see lib/propertyColumns.js).
  let q = supabase.from('properties').select(PROPERTY_PUBLIC_COLUMNS)
    .in('category', categories)
    .eq('status', 'active')
    .or('category.eq.sale,occupancy_status.is.null,occupancy_status.eq.vacant')
    .order('created_at', { ascending: false }).limit(40)
  if (land === 'only')    q = q.eq('property_type', 'land')
  if (land === 'exclude') q = q.neq('property_type', 'land')
  if (state !== 'All States') q = q.eq('state', state)
  return q
}

// Kept for older callers: the rentals-only list.
export const fetchActiveRentals = (type, state) => fetchActivePlaces(type, state)

// Identity verification status for these sellers, for the Verified Host badge.
export function fetchHostVerification(sellerIds) {
  return supabase.from('public_profiles')
    .select('id, identity_verification_status')
    .in('id', sellerIds)
}

// A lead signal only. It reveals no contact details and does not move a deal forward.
export function insertRentalEnquiry(row) {
  return supabase.from('rental_enquiries').insert(row)
}

// Posts a new rental, hotel or short-let. The caller supplies the whole row, already cleaned of
// control characters (the database rejects a NUL byte), and sets its status. Resolves with the new id.
// `row.images` ({ url, is_primary } entries) is saved to property_images; properties has no such
// column. If the photos cannot be saved the listing is removed again and `error` is set.
export function insertListedProperty(row) {
  return insertListingWithPhotos(supabase, row, 'id')
}
