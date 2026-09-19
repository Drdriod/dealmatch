/**
 * Listings module - owns `public.category_listings`.
 * Attribute validation happens BEFORE this module is called (see
 * src/lib/schemaValidation.js) - this service assumes attributes are
 * already valid for the given category and just persists them.
 */

// Best-effort AI indexing (api/index-listing.js). Fire-and-forget: a
// listing must never fail to save just because the AI indexing call had a
// hiccup, so failures here are logged, not thrown. This is the single
// integration point for every category_listings row - i.e. every
// people-and-places service on the platform - so AI matching (item 1 of
// the fix request) covers the whole catalog, not one hand-picked vertical.
async function indexListingBestEffort(supabase, listingId) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const base = import.meta.env.VITE_APP_URL || ''
    await fetch(`${base}/api/index-listing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ listingId }),
    })
  } catch (err) {
    console.error('indexListingBestEffort failed (non-fatal):', err.message)
  }
}

export async function createListing(supabase, {
  userId, categoryId, type, title, description, priceCents,
  lat, lng, locationName, attributes,
}) {
  if (!userId || !categoryId || !type || !title) {
    throw new Error('userId, categoryId, type, and title are required')
  }
  if (!['SUPPLY', 'DEMAND'].includes(type)) {
    throw new Error('type must be SUPPLY or DEMAND')
  }

  const row = {
    user_id: userId,
    category_id: categoryId,
    type,
    title,
    description: description ?? null,
    price_cents: priceCents ?? null,
    location_name: locationName ?? null,
    attributes: attributes ?? {},
  }

  // PostGIS geography columns take a WKT/EWKT string over PostgREST, not lat/lng fields directly
  if (lat != null && lng != null) {
    row.location = `SRID=4326;POINT(${lng} ${lat})`
  }

  const { data, error } = await supabase
    .from('category_listings')
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(`createListing failed: ${error.message}`)

  // Index for AI matching - fire-and-forget, does not block the caller or
  // fail listing creation if AI matching is unavailable.
  indexListingBestEffort(supabase, data.id)

  return data
}

export async function getListing(supabase, id) {
  const { data, error } = await supabase
    .rpc('get_listing_with_latlng', { p_id: id })
    .single()

  if (error) throw new Error(`getListing(${id}) failed: ${error.message}`)
  return data
}

export async function updateListingStatus(supabase, id, userId, status) {
  const { data, error } = await supabase
    .from('category_listings')
    .update({ status })
    .eq('id', id)
    .eq('user_id', userId) // RLS also enforces this; belt and braces
    .select()
    .single()

  if (error) throw new Error(`updateListingStatus(${id}) failed: ${error.message}`)

  // Re-index (or remove from the vector index, if no longer ACTIVE) so
  // sold/paused/removed listings stop surfacing in AI matches.
  indexListingBestEffort(supabase, id)

  return data
}

export async function listMyListings(supabase, userId, { categoryId, withCategory = false } = {}) {
  let query = supabase.from('category_listings')
    .select(withCategory ? '*, categories(name)' : '*')
    .eq('user_id', userId)
  if (categoryId) query = query.eq('category_id', categoryId)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error(`listMyListings failed: ${error.message}`)
  return data
}
