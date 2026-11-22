// Repository for the admin Finance tab. One read-only database function does all the sums.
import { supabase } from '@/lib/supabase'

export function fetchFinanceSummary(from, to) {
  return supabase.rpc('admin_finance_summary', { p_from: from.toISOString(), p_to: to.toISOString() })
}

export function fetchFinanceGateway(from, to) {
  return supabase.rpc('admin_finance_gateway', { p_from: from.toISOString(), p_to: to.toISOString() })
}

export function fetchGatewaySettings() {
  return supabase.from('gateway_fee_settings').select('key,label,unit,value,note,sort_order,updated_at').order('sort_order')
}

export function setGatewaySetting({ key, value }) {
  return supabase.rpc('admin_set_gateway_fee_setting', { p_key: key, p_value: Number(value) })
}
