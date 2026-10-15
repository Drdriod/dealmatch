// Repository (structural pattern) for a buyer's interest in a property (PropertyInterestModal).
import { supabase } from '@/lib/supabase'

// Saves the buyer's interest. There is one row per buyer per property, so a second
// submission replaces the first. The caller supplies the whole row.
export function upsertPropertyInterest(row) {
  return supabase.from('property_interest').upsert(row, { onConflict: 'user_id,property_id' })
}
