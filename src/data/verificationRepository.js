// Repository (structural pattern) for the two verification pages: the agent's
// property verification queue (VerificationPage) and a provider's skill
// verification (SkillVerificationPage). The pages call these and never build a query.
import { supabase } from '@/lib/supabase'
import { PROPERTY_OWNER_COLUMNS } from '@/lib/propertyColumns'

// ── Agent property verification queue ──

// Named columns, not '*' (migration 18). The page draws the listing's photos from `images`, which
// is a set of property_images rows, not a column, so it is embedded.
export function fetchPropertiesByStatus(status) {
  return supabase.from('properties')
    .select(`${PROPERTY_OWNER_COLUMNS}, images:property_images(id, url, is_primary, caption), profiles(full_name, phone, email, avatar_url)`)
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(50)
}

export function updatePropertyVerification(propertyId, fields) {
  return supabase.from('properties').update(fields).eq('id', propertyId)
}

// ── Provider skill verification (level 2) ──

// The latest level 2 submission and the provider's current level, in that order.
export function loadSkillVerificationState(userId) {
  return Promise.all([
    supabase.from('verification_submissions')
      .select('id, status, created_at, level')
      .eq('user_id', userId).eq('level', 2)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('verified_providers').select('level').eq('user_id', userId).maybeSingle(),
  ])
}

// The provider's current tier and their most recent level 2 submission (whatever its
// status), in that order. ProfilePage shows what they already submitted.
export function loadProviderSummary(userId) {
  return Promise.all([
    supabase.from('verified_providers').select('level, level_data').eq('user_id', userId).maybeSingle(),
    supabase.from('verification_submissions').select('status, submission_data, created_at')
      .eq('user_id', userId).eq('level', 2).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
}

// Creates a pending level 2 submission. A provider cannot approve their own submission;
// only staff can, through the review function in the database.
export function submitSkillVerification(data) {
  return supabase.rpc('submit_verification', {
    p_level: 2,
    p_kind: 'portfolio',
    p_data: data,
  })
}
