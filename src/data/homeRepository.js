// Repository (structural pattern) for the home page's platform numbers (HomePage).
import { supabase } from '@/lib/supabase'

// Three live counts, in this order: active properties, live-verified users, sold properties.
// Each resolves to { count }. Only the count is read; no rows come back.
export function fetchHomeCounts() {
  return Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_live_verified', true),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'sold'),
  ])
}
