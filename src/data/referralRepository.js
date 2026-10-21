// Repository (structural pattern) for the Referral page.
import { supabase } from '@/lib/supabase'

// Gives the user an invite code if they do not have one yet. Returns the
// response shape the page already handles: { data, error }.
export function saveInviteCode(userId, code) {
  return supabase.from('profiles')
    .update({ invite_code: code }).eq('id', userId)
    .select('invite_code').single()
}

// The three results the page shows, in the order it destructures them:
// transactions, invited-user count, and loyalty points.
export function loadReferralSummary(userId) {
  return Promise.all([
    supabase.from('referral_transactions').select('*')
      .eq('referrer_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('invited_by', userId),
    supabase.from('loyalty_points').select('*').eq('user_id', userId).single(),
  ])
}
