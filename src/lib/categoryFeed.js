import { supabase } from '@/lib/supabase'

/**
 * Active places linked to any of the given category ids (a group and its
 * leaves, or a single leaf). Shaped for PlaceCard. Places are linked to a
 * category through properties.category_id; unassigned places are not listed.
 */
export async function fetchPlacesForCategories(categoryIds) {
  if (!categoryIds?.length) return []

  const { data, error } = await supabase
    .from('properties')
    // Photos come from property_images; properties has no `images` column.
    .select('id, title, price, city, state, category, created_at, images:property_images(url, is_primary)')
    .in('category_id', categoryIds)
    .eq('status', 'active')
    .or('occupancy_status.is.null,occupancy_status.eq.vacant')
    .order('created_at', { ascending: false })
    .limit(24)

  if (error) throw error

  return (data || []).map(p => ({
    id: p.id,
    title: p.title,
    image: p.images?.find(i => i?.is_primary)?.url || p.images?.[0]?.url || null,
    area: p.city ? `${p.city}, ${p.state}` : p.state,
    price: p.price || null,
    priceUnit: p.category === 'shortlet' ? '/night' : '/year',
    // Verified status is shown on the homepage rails; not computed here yet.
    verified: false,
  }))
}
