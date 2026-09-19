/**
 * Matching module - hard-filter geo + attribute matching for category_listings,
 * via the `match_category_listings` Postgres function (see the multicategory
 * catalog migration). Combines JSONB containment with PostGIS radius search
 * in a single round trip, per the architecture spec's Phase 4 requirement.
 *
 * Semantic/AI ranking (Pinecone) now covers every category_listings row -
 * people AND places, not just Real Estate - via /api/match-listings (see
 * api/lib/ai.js for the real embedding + geo bounding-box logic, and
 * api/index-listing.js for how listings get indexed in the first place).
 * Real Estate's `properties` table keeps its own dedicated path
 * (src/lib/pinecone.js + api/match.js) since it's a separate legacy table.
 */

/**
 * AI + location match against every indexed category_listings row
 * (services, skills, places-as-listings - everything routed through the
 * unified marketplace model). This is the "real AI matching plus location
 * for the people/places services" piece: semantic similarity from a real
 * embedding, combined with a lat/lng radius filter when location is known.
 * Resolves to [] (never throws) if AI matching isn't configured
 * (no PINECONE_API_KEY) or the request fails, so callers
 * like universal search can always fall back to keyword results.
 */
export async function aiMatchListings({ queryText, categorySlug = null, type = null, lat = null, lng = null, radiusMeters = 15000 }) {
  if (!queryText || !queryText.trim()) return []
  try {
    const base = import.meta.env.VITE_APP_URL || ''
    const res = await fetch(`${base}/api/match-listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryText, categorySlug, type, lat, lng, radiusMeters }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.matches || []
  } catch (err) {
    console.error('aiMatchListings failed:', err.message)
    return []
  }
}

/**
 * Hybrid model (ADR-002). Unified browse/filter/geo-match across
 * category_listings and every legacy vertical (properties, student_hostels,
 * professionals), dispatched server-side by categories.source_table.
 * Takes a category slug, not an id, since universal_match() looks the
 * category up itself.
 */
export async function universalMatch(supabase, categorySlug, {
  lat = null, lng = null, radiusMeters = 10000, attributeFilter = {}, limit = 50,
} = {}) {
  const { data, error } = await supabase.rpc('universal_match', {
    p_category_slug: categorySlug,
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusMeters,
    p_attribute_filter: attributeFilter,
    p_limit: limit,
  })

  if (error) throw new Error(`universalMatch failed: ${error.message}`)
  return data
}

export async function findMatches(supabase, {
  categoryId,
  type, // the type you're searching FOR - e.g. searching for SUPPLY to fill a DEMAND
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
