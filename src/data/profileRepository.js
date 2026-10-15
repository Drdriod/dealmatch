// Repository (structural pattern) for the signed-in user's own profile row, used by
// the sign-in, onboarding and profile pages. The pages call these and never build a query.
import { supabase } from '@/lib/supabase'

// Whether this user finished onboarding, plus the fields the welcome toast needs.
// Returns { data: null } for a user with no profile row yet.
export function fetchOnboardingState(userId) {
  return supabase.from('profiles')
    .select('onboarding_completed, role, full_name')
    .eq('id', userId)
    .maybeSingle()
}

// The user's role, used to decide where to send them after a password reset.
export function fetchProfileRole(userId) {
  return supabase.from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
}

// Creates the profile row for a new user, or updates it if one already exists.
export function upsertProfile(fields) {
  return supabase.from('profiles').upsert(fields, { onConflict: 'id' })
}

// Saves the answers from the onboarding flow.
export function saveOnboardingProfile(userId, payload) {
  return supabase.from('profiles').update(payload).eq('id', userId)
}

// "Become a provider" is an honest toggle. It does not grant provider status;
// staff still review the evidence the user submits afterwards.
export function markOffersServices(userId) {
  return supabase.from('profiles').update({ offers_services: true }).eq('id', userId)
}
