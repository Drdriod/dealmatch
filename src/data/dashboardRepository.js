// Repository (structural pattern) for the user dashboard. The page asks for
// what it shows; it never builds a query. Results keep the Supabase
// { data, error } / { count } shapes the page already reads.
import { supabase } from '@/lib/supabase'
import { listMyListings } from '@/modules/listings/listingsService'

export function fetchMyPropertyListings(userId, limit = 5) {
  return supabase.from('properties')
    .select('id, title, price, status, category, created_at')
    .eq('seller_id', userId).order('created_at', { ascending: false }).limit(limit)
}

// Category listings (people and places services). A failed read counts as none.
export function fetchMyCategoryListings(userId) {
  return listMyListings(supabase, userId).catch(() => [])
}

// Unified view across rental_enquiries / professional_requests / transactions
// (see 20260813000000_dashboard_profile_spec.sql).
export function fetchMyRequests(limit = 5) {
  return supabase.from('my_requests')
    .select('request_type, request_id, title, status, created_at')
    .order('created_at', { ascending: false }).limit(limit)
}

export function countMyMatches(userId) {
  return supabase.from('matches').select('*', { count: 'exact', head: true }).eq('user_id', userId)
}

export function countMySwipeLikes(userId) {
  return supabase.from('swipes').select('*', { count: 'exact', head: true })
    .eq('user_id', userId).in('action', ['like', 'super'])
}

export function countCompletedEscrowSales(userId) {
  return supabase.from('escrow_transactions').select('*', { count: 'exact', head: true })
    .eq('seller_id', userId).in('status', ['funded', 'completed'])
}

export function countCompletedProviderTransactions(userId) {
  return supabase.from('transactions').select('*', { count: 'exact', head: true })
    .eq('provider_id', userId).eq('status', 'COMPLETED')
}

// Creation dates only, for the sparkline tiles.
export function fetchMyPropertyDatesSince(userId, since) {
  return supabase.from('properties').select('created_at').eq('seller_id', userId).gte('created_at', since)
}

export function fetchRequestDatesSince(since) {
  return supabase.from('my_requests').select('created_at').gte('created_at', since)
}

// Calls onChange whenever this user's swipes change. Returns the unsubscribe function.
export function subscribeToMySwipes(userId, onChange) {
  const channel = supabase
    .channel('swipes-changes')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'swipes',
      filter: `user_id=eq.${userId}`,
    }, () => onChange())
    .subscribe()
  return () => supabase.removeChannel(channel)
}

export function markOfferingServices(userId) {
  return supabase.from('profiles').update({ offers_services: true }).eq('id', userId)
}
