// Repository (structural pattern) for the quick search box (SearchPalette).
import { supabase } from '@/lib/supabase'

// Up to six active properties whose title, city or state contains the text.
export function searchActiveProperties(text) {
  return supabase
    .from('properties')
    .select('id, title, city, state, price, property_type')
    .eq('status', 'active')
    .or(`title.ilike.%${text}%,city.ilike.%${text}%,state.ilike.%${text}%`)
    .limit(6)
}
