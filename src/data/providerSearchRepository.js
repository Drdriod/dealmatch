// Repository (structural pattern) for finding providers near a point (FindProviderPage).
// The page calls these and never builds a query.
import { supabase } from '@/lib/supabase'

// The centre point of each Nigerian state, used when the viewer has not shared a precise location.
export function fetchStatePoints() {
  return supabase.from('nigeria_state_points').select('state, lat, lng')
}

// Providers within a radius of a point, at or above a verification level, ranked by the database.
export function searchProvidersNear({ lat, lng, radiusM, minLevel, limit, offset }) {
  return supabase.rpc('search_providers_rpc', {
    client_lat: lat,
    client_lng: lng,
    radius_m: radiusM,
    min_level: minLevel,
    page_limit: limit,
    page_offset: offset,
  })
}

// The details to show on each result, for these user ids: verification record, public profile
// and review stats, in that order.
export function fetchProviderCardDetails(ids) {
  return Promise.all([
    supabase.from('verified_providers').select('user_id, level, level_data, updated_at').in('user_id', ids),
    supabase.from('public_profiles').select('id, full_name, avatar_url, city, state, bio').in('id', ids),
    supabase.from('provider_stats').select('provider_id, review_count, avg_rating, completion_rate').in('provider_id', ids),
  ])
}
