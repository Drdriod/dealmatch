/**
 * Listings module — owns `public.category_listings`.
 * Attribute validation happens BEFORE this module is called (see
 * src/lib/schemaValidation.js) — this service assumes attributes are
 * already valid for the given category and just persists them.
 */

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
  return data
}

export async function listMyListings(supabase, userId, { categoryId } = {}) {
  let query = supabase.from('category_listings').select('*').eq('user_id', userId)
  if (categoryId) query = query.eq('category_id', categoryId)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error(`listMyListings failed: ${error.message}`)
  return data
}
