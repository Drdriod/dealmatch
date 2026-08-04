/**
 * Matching module — hard-filter geo + attribute matching for category_listings,
 * via the `match_category_listings` Postgres function (see the multicategory
 * catalog migration). Combines JSONB containment with PostGIS radius search
 * in a single round trip, per the architecture spec's Phase 4 requirement.
 *
 * Semantic/AI ranking (Pinecone) is a separate concern that stays scoped to
 * Real Estate for now — see src/lib/pinecone.js and api/match.js.
 */

export async function findMatches(supabase, {
  categoryId,
  type, // the type you're searching FOR — e.g. searching for SUPPLY to fill a DEMAND
  lat = null,
  lng = null,
  radiusMeters = 10000,
  attributeFilter = {},
  limit = 50,
}) {
  if (!categoryId || !type) {
    throw new Error('categoryId and type are required')
  }
  if (!['SUPPLY', 'DEMAND'].includes(type)) {
    throw new Error('type must be SUPPLY or DEMAND')
  }

  const { data, error } = await supabase.rpc('match_category_listings', {
    p_category_id: categoryId,
    p_type: type,
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusMeters,
    p_attribute_filter: attributeFilter,
    p_limit: limit,
  })

  if (error) throw new Error(`findMatches failed: ${error.message}`)
  return data
}

/** Convenience: find the counterpart matches for a listing that was just created. */
export async function findCounterpartMatches(supabase, listing, { radiusMeters = 10000, limit = 20 } = {}) {
  const counterpartType = listing.type === 'SUPPLY' ? 'DEMAND' : 'SUPPLY'

  // listing.lat/listing.lng come from getListing(), which now calls the
  // get_listing_with_latlng RPC (explicit ST_Y/ST_X) rather than returning
  // a raw PostGIS geography value. This replaces an earlier version that
  // tried to read listing.location.coordinates directly, an assumption
  // about PostgREST's geography serialization that was never actually
  // verified against a live database.
  const lat = typeof listing.lat === 'number' ? listing.lat : null
  const lng = typeof listing.lng === 'number' ? listing.lng : null

  return findMatches(supabase, {
    categoryId: listing.category_id,
    type: counterpartType,
    lat,
    lng,
    radiusMeters,
    limit,
  })
}
