// Repository (structural pattern) for the buyer's matches (MatchesPage).
import { supabase } from '@/lib/supabase'

// Removes one match. A match is a "like" row in swipes.
export function removeSwipe(swipeId) {
  return supabase.from('swipes').delete().eq('id', swipeId)
}
