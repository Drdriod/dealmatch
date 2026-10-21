import { supabase } from './supabase'

/**
 * Places near you - same shape of query as RentalsPage.loadRentals()
 * (active rental/shortlet properties, not marked occupied, host identity
 * verification joined in for the Verified badge). Duplicated here rather
 * than imported from RentalsPage because this ticket is homepage-only and
 * must not change that page's behaviour. A follow-up can consolidate both
 * call sites onto one shared query if that page is ever revisited.
 *
 * Returns a normalized shape PlaceCard expects to receive directly.
 */
export async function fetchPlacesNearYou(limit = 8) {
  const { data, error } = await supabase
    .from('properties')
    // `images` is not a column of properties (it belongs to student_hostels). Photos live in
    // property_images, so they are embedded; the mapping below reads is_primary and url from them.
    .select('id, title, price, city, state, category, seller_id, created_at, images:property_images(url, is_primary)')
    .in('category', ['rental', 'shortlet'])
    .eq('status', 'active')
    .or('occupancy_status.is.null,occupancy_status.eq.vacant')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data?.length) return []

  const sellerIds = [...new Set(data.map(r => r.seller_id).filter(Boolean))]
  let verifiedSellerIds = new Set()
  if (sellerIds.length > 0) {
    const { data: sellers } = await supabase.from('public_profiles')
      .select('id, identity_verification_status').in('id', sellerIds)
    verifiedSellerIds = new Set((sellers || [])
      .filter(s => s.identity_verification_status === 'approved')
      .map(s => s.id))
  }

  return data.map(p => ({
    id: p.id,
    title: p.title,
    image: p.images?.find(i => i?.is_primary)?.url || p.images?.[0]?.url || null,
    area: p.city ? `${p.city}, ${p.state}` : p.state,
    price: p.price || null,
    priceUnit: p.category === 'shortlet' ? '/night' : '/year',
    verified: verifiedSellerIds.has(p.seller_id),
  }))
}

/**
 * People near you - same shape of query as FindProviderPage's Skill
 * Verified (level >= 2) fetch. Duplicated here for the same reason as
 * above: this ticket must not touch Find a Provider's own filters/query.
 *
 * Returns a normalized shape PersonCard expects to receive directly.
 */
export async function fetchPeopleNearYou(limit = 8) {
  const { data: vp, error } = await supabase
    .from('verified_providers')
    .select('user_id, level, level_data, updated_at')
    .gte('level', 2)
    .order('level', { ascending: false })
    .limit(limit)

  if (error || !vp?.length) return []

  const ids = vp.map(v => v.user_id)
  const { data: profiles } = await supabase
    .from('public_profiles').select('id, full_name, avatar_url, city, state').in('id', ids)

  return vp.map(v => {
    const p = profiles?.find(x => x.id === v.user_id)
    return {
      id: v.user_id,
      name: p?.full_name || 'DealMatch provider',
      avatar: p?.avatar_url || null,
      area: v.level_data?.area || (p?.city ? `${p.city}, ${p.state}` : p?.state) || null,
      category: v.level_data?.category || null,
      trusted: v.level >= 3,
      openPrice: v.level_data?.open_price !== false,
      priceCents: v.level_data?.price_cents || null,
    }
  })
}
