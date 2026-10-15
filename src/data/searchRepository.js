// Repository (structural pattern) for the quick search box (SearchPalette).
import { supabase } from '@/lib/supabase'
import { cleanSearchTerm } from '@/lib/searchTerm'

// Up to six active properties whose title, city or state contains the text. The text is cleaned
// first (commas and brackets would otherwise be read as filter syntax), and text with nothing
// left to match gives no results rather than matching everything.
export function searchActiveProperties(text) {
  const term = cleanSearchTerm(text)
  if (!term) return Promise.resolve({ data: [], error: null })
  return supabase
    .from('properties')
    .select('id, title, city, state, price, property_type')
    .eq('status', 'active')
    .or(`title.ilike.%${term}%,city.ilike.%${term}%,state.ilike.%${term}%`)
    .limit(6)
}
