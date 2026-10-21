// Repository (structural pattern) for the admin Settings tab: platform settings
// and the bank accounts that receive DealMatch funds. Callers check the
// superadmin role and reauthentication before calling any write here.
import { supabase } from '@/lib/supabase'

export function fetchPlatformSettings() {
  return supabase.from('platform_settings').select('key,value')
}

export function upsertPlatformSetting({ key, value, updatedBy }) {
  return supabase.from('platform_settings').upsert({
    key, value, updated_by: updatedBy, updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
}

// Primary account first, then newest.
export function fetchBankAccounts() {
  return supabase.from('bank_details').select('*')
    .order('is_primary', { ascending: false }).order('created_at', { ascending: false })
}

export function insertBankAccount(payload) {
  return supabase.from('bank_details').insert(payload)
}

export function updateBankAccount(id, patch) {
  return supabase.from('bank_details').update(patch).eq('id', id)
}

// Clears the primary flag on every account except one. Used before making another primary.
export function clearOtherPrimaryBankAccounts(exceptId) {
  return supabase.from('bank_details').update({ is_primary: false }).neq('id', exceptId)
}

export function deleteBankAccount(id) {
  return supabase.from('bank_details').delete().eq('id', id)
}
