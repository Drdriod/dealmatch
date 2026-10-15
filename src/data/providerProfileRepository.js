// Repository (structural pattern) for a provider's public profile (ProviderProfilePage).
// The page calls these and never builds a query. Their active listings come from
// modules/listings/listingsService, which owns that table.
import { supabase } from '@/lib/supabase'

export function fetchPublicProfile(providerId) {
  return supabase.from('public_profiles').select('*').eq('id', providerId).single()
}

// The provider's verification level and the details they submitted with it.
export function fetchVerifiedProvider(providerId) {
  return supabase.from('verified_providers').select('level, level_data').eq('user_id', providerId).single()
}

export function fetchProviderStats(providerId) {
  return supabase.from('provider_stats').select('*').eq('provider_id', providerId).single()
}

// The ten most recent reviews. Reviewer names are fetched separately by fetchReviewerNames.
export function fetchRecentReviews(providerId) {
  return supabase
    .from('reviews')
    .select('id, rating, comment, created_at, reviewer_id')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(10)
}

// Metadata only (banner, bio, categories). Their listings are queried live elsewhere, so a
// page with no listings still renders.
export function fetchBusinessPage(providerId) {
  return supabase.from('business_pages').select('*').eq('profile_id', providerId).maybeSingle()
}

// The status of the provider's payout account. Only meaningful to the owner of the profile;
// row security returns nothing to anyone else.
export function fetchPayoutStatus(providerId) {
  return supabase.from('payout_accounts').select('status').eq('profile_id', providerId).maybeSingle()
}

// Names for the reviewers. Fetched apart from the reviews because reviewer_id points at the
// auth users table, not at profiles, so a join in one query is not possible.
export function fetchReviewerNames(reviewerIds) {
  return supabase.from('public_profiles').select('id, full_name').in('id', reviewerIds)
}
