// Repository (structural pattern) for the landlord dashboard. Each function
// returns the Supabase { data, error } result the page already handles.
import { supabase } from '@/lib/supabase'
import { PROPERTY_OWNER_COLUMNS } from '@/lib/propertyColumns'

// Named columns, not '*': a browser role cannot read the private columns of properties
// (migration 18), so a wildcard read fails. See lib/propertyColumns.js.
export function fetchMyListings(userId) {
  return supabase.from('properties').select(PROPERTY_OWNER_COLUMNS)
    .eq('seller_id', userId).order('created_at', { ascending: false })
}

export function fetchBookingsForProperties(propertyIds) {
  return supabase.from('bookings')
    .select('*, properties(title, city, state, category)')
    .in('property_id', propertyIds)
    .order('created_at', { ascending: false })
    .limit(20)
}

export function fetchEnquiriesForProperties(propertyIds) {
  return supabase.from('rental_enquiries')
    .select('id, property_id, status, created_at')
    .in('property_id', propertyIds)
    .order('created_at', { ascending: false })
    .limit(200)
}

// Rent collected: rental escrow deposits the landlord can see (funded or released).
export function fetchRentPayments(userId) {
  return supabase.from('escrow_transactions')
    .select('id, property_id, gross_amount, status, created_at')
    .eq('seller_id', userId)
    .eq('transaction_type', 'rental')
    .in('status', ['funded', 'completed'])
    .order('created_at', { ascending: false })
    .limit(500)
}

export function setListingStatus(listingId, status) {
  return supabase.from('properties').update({ status }).eq('id', listingId)
}
