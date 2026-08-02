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

  let lat = null, lng = null
  // listing.location comes back from PostgREST as GeoJSON when selected with the right format;
  // callers that already have lat/lng (e.g. from the create-listing request) should pass those
  // in directly instead of relying on this fallback.
  if (listing.location?.coordinates) {
    [lng, lat] = listing.location.coordinates
  }

  return findMatches(supabase, {
    categoryId: listing.category_id,
    type: counterpartType,
    lat,
    lng,
    radiusMeters,
    limit,
  })
}
