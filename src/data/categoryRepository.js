// Repository (structural pattern) for the people shown on a category page (CategoryPage).
import { supabase } from '@/lib/supabase'

// Verified providers (level 2 or higher) whose category label matches this name. The category
// is a text label inside level_data, so it is matched by name. At most 24.
export function fetchVerifiedProvidersInCategory(categoryName) {
  return supabase
    .from('verified_providers')
    .select('user_id, level, level_data')
    .gte('level', 2)
    .eq('level_data->>category', categoryName)
    .limit(24)
}

// Public name, photo and area for these users.
export function fetchPublicProfilesByIds(ids) {
  return supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, city, state')
    .in('id', ids)
}
