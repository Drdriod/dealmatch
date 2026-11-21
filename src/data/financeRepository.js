// Repository for the admin Finance tab. One read-only database function does all the sums.
import { supabase } from '@/lib/supabase'

export function fetchFinanceSummary(from, to) {
  return supabase.rpc('admin_finance_summary', { p_from: from.toISOString(), p_to: to.toISOString() })
}
