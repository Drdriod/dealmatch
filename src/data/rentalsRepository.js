// Repository (structural pattern) for browsing rentals and short-lets (RentalsPage), and for
// posting a rental (ListRentalPage). The pages call these and never build a query.
import { supabase } from '@/lib/supabase'
import { PROPERTY_PUBLIC_COLUMNS } from '@/lib/propertyColumns'

// Active rentals and short-lets, newest first, at most 40. Units marked occupied are hidden so
// nobody double-books; a null occupancy is an older listing and counts as vacant.
// `type` is 'Rental', 'Short-let' or anything else for both. 'All States' means no state filter.
export function fetchActiveRentals(type, state) {
  // Named public columns: this list is open to anonymous visitors (see lib/propertyColumns.js).
  let q = supabase.from('properties').select(PROPERTY_PUBLIC_COLUMNS)
    .in('category', ['rental', 'shortlet'])
    .eq('status', 'active')
    .or('occupancy_status.is.null,occupancy_status.eq.vacant')
    .order('created_at', { ascending: false }).limit(40)
  if (type === 'Rental')    q = q.eq('category', 'rental')
  if (type === 'Short-let') q = q.eq('category', 'shortlet')
  if (state !== 'All States') q = q.eq('state', state)
  return q
}

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
export function insertListedProperty(row) {
  return supabase.from('properties').insert(row).select('id').single()
}
