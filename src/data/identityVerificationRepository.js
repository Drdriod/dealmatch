// Repository (structural pattern) for identity verification (VerifyIdentityPage).
// The page calls these and never builds a query itself.
import { supabase } from '@/lib/supabase'

export function markVerificationSkipped(userId) {
  return supabase.from('profiles')
    .update({ verification_skipped: true })
    .eq('id', userId)
}

export function fetchLiveVerified(userId) {
  return supabase.from('profiles').select('is_live_verified').eq('id', userId).single()
}

// Stores the submitted document paths and marks the profile as submitted. The caller passes
// the fields; is_photo_verified and is_live_verified are set only by an admin, never here.
export function saveIdentitySubmission(userId, fields) {
  return supabase.from('profiles').update(fields).eq('id', userId)
}
