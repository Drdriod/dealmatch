// Repository (structural pattern) for the home page's platform numbers (HomePage).
import { supabase } from '@/lib/supabase'

// Three live counts, in this order: active properties, live-verified users, sold properties.
// Each resolves to { count }. Only the count is read; no rows come back.
// The properties counts name `id`: a head-count `*` is refused for a visitor, because a browser
// role cannot read every column of properties (migration 18).
export function fetchHomeCounts() {
  return Promise.all([
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_live_verified', true),
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'sold'),
  ])
}
