// Repository for the admin Referral settings tab.
import { supabase } from '@/lib/supabase'

export function fetchReferralSettings() {
  return supabase.from('referral_settings').select('key,label,description,unit,value,sort_order,updated_at').order('sort_order')
}

export function setReferralSetting({ key, value }) {
  return supabase.rpc('admin_set_referral_setting', { p_key: key, p_value: Number(value) })
}

export function fetchReferralSettingHistory(limit = 25) {
  return supabase.from('referral_setting_history').select('key,old_value,new_value,changed_at').order('changed_at', { ascending: false }).limit(limit)
}

// Rewards waiting for an admin to approve or reject (a referrer went over the monthly cap).
export function fetchReferralReviewQueue() {
  return supabase.from('referral_transactions')
    .select('id,referrer_id,referee_id,referral_level,referral_earning,transaction_type,created_at')
    .eq('needs_review', true).eq('status', 'pending').order('created_at', { ascending: true }).limit(100)
}

export function reviewReferral({ id, approve }) {
  return supabase.rpc('admin_review_referral', { p_id: id, p_approve: !!approve })
}
