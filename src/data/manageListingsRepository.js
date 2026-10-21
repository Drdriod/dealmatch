// Repository (structural pattern) for the seller's property rows on ManageListingsPage.
// Category listings go through modules/listings/listingsService instead.
import { supabase } from '@/lib/supabase'

// The seller's own properties, newest first, with the columns the list shows.
export function fetchMyProperties(userId) {
  return supabase.from('properties')
    .select('id, title, price, city, state, status, view_count, like_count, listing_type, created_at')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false })
}

// Pauses, reactivates or removes a property by changing its status. Properties are never
// deleted: escrow and transaction history refer to them. Row security decides who may do this
// (the seller and staff), so the page does not filter by seller.
export function setPropertyStatus(propertyId, status) {
  return supabase.from('properties').update({ status }).eq('id', propertyId)
}
