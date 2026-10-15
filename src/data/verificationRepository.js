// Repository (structural pattern) for the two verification pages: the agent's
// property verification queue (VerificationPage) and a provider's skill
// verification (SkillVerificationPage). The pages call these and never build a query.
import { supabase } from '@/lib/supabase'

// ── Agent property verification queue ──

export function fetchPropertiesByStatus(status) {
  return supabase.from('properties')
    .select('*, profiles(full_name, phone, email, avatar_url)')
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

// Creates a pending level 2 submission. A provider cannot approve their own submission;
// only staff can, through the review function in the database.
export function submitSkillVerification(data) {
  return supabase.rpc('submit_verification', {
    p_level: 2,
    p_kind: 'portfolio',
    p_data: data,
  })
}
