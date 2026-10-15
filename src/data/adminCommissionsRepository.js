// Repository (structural pattern) for the admin Platform Fees tab: commission
// schedules. A new schedule is always written as SCHEDULED. The database promotes
// it to ACTIVE at its effective date, so only one schedule is active per category.
import { supabase } from '@/lib/supabase'
import { listCategories } from '@/modules/catalog/catalogService'

export function fetchCommissions() {
  return supabase.from('commissions').select('*').order('effective_date', { ascending: false })
}

export function fetchCategoriesForFees() {
  return listCategories(supabase, { includeInactive: true }).catch(() => [])
}

export function insertCommission(payload) {
  return supabase.from('commissions').insert(payload)
}

export function setCommissionStatus(commissionId, patch) {
  return supabase.from('commissions').update(patch).eq('id', commissionId)
}
