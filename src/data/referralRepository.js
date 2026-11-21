// Repository (structural pattern) for the Referral page.
import { supabase } from '@/lib/supabase'

// Gives the user an invite code if they do not have one yet. Returns { data, error }.
export function saveInviteCode(userId, code) {
  return supabase.from('profiles')
    .update({ invite_code: code }).eq('id', userId)
    .select('invite_code').single()
}

// Everything the Referral page shows. First releases any of this person's rewards whose hold has
// ended (the database does it, only for their own rows), then reads:
// [rewards, invited count, settings, founding row, unlock-credit balance]
export async function loadReferralOverview(userId) {
  await supabase.rpc('release_my_referral_rewards')
  return Promise.all([
    supabase.from('referral_transactions')
      .select('id,referral_level,payout_type,referral_earning,wht_amount,net_amount,status,needs_review,eligible_at,released_at,transaction_type,points_awarded,created_at,referee_id')
      .eq('referrer_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('invited_by', userId),
    supabase.from('referral_settings').select('key,value'),
    supabase.from('referral_founding').select('until').eq('user_id', userId).maybeSingle(),
    supabase.rpc('get_unlock_credit_balance'),
  ])
}

// Links the signed-in new account to the owner of a referral code (migration 20261024000000).
// Returns { data, error } where data is one of: applied, already_set, too_late, invalid, self,
// no_profile. Callers must not block sign-up on the result.
export function applyReferralCode(code) {
  return supabase.rpc('apply_referral_code', { p_code: code })
}
