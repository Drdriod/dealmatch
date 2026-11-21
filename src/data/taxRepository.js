// Repository for the admin Tax tab. The only module that talks to the database for tax.
// Each function returns { data, error } as Supabase does.
//
// Reading the ledger is limited by the database to the owner and to accounts the owner added
// (public.tax_access). Ordinary admins get an empty list and canReadTax() answers false.
import { supabase } from '@/lib/supabase'

export function fetchTaxSettings() {
  return supabase.from('tax_settings').select('key,label,description,rate_pct,is_active,updated_at').order('key')
}

export function setTaxSetting({ key, ratePct, isActive }) {
  return supabase.rpc('admin_set_tax_setting', { p_key: key, p_rate: Number(ratePct), p_active: !!isActive })
}

export async function canReadTax() {
  const { data, error } = await supabase.rpc('can_read_tax')
  return error ? false : data === true
}

export function fetchTaxHistory(limit = 25) {
  return supabase.from('tax_setting_history')
    .select('key,old_rate,new_rate,old_active,new_active,changed_at')
    .order('changed_at', { ascending: false }).limit(limit)
}

export function fetchTaxLedger(limit = 500) {
  return supabase.from('tax_ledger')
    .select('id,reference,kind,purpose,base_kobo,rate_pct,tax_kobo,status,created_at,remitted_at')
    .order('created_at', { ascending: false }).limit(limit)
}

export function markTaxRemitted({ kind, until, note }) {
  return supabase.rpc('admin_mark_tax_remitted', { p_kind: kind, p_until: until, p_note: note?.trim() || null })
}

export function listTaxAccess() {
  return supabase.rpc('admin_list_tax_access')
}

export function setTaxAccess({ userId, allow, note }) {
  return supabase.rpc('admin_set_tax_access', { p_user: userId, p_allow: !!allow, p_note: note?.trim() || null })
}

// Finds an account by email so the owner can add it to the tax readers.
export function findUserByEmail(email) {
  return supabase.from('profiles').select('id,full_name,email').ilike('email', email.trim()).limit(1)
}
