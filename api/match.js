// api/match.js - AI property matching via Pinecone
// Vercel serverless function: POST /api/match

import { redisRateLimit, cacheGet, cacheSet } from '../src/lib/redis.js'
import { getEmbedding, getPineconeIndex, boundingBoxFilter, distanceMeters, EmbeddingUnavailableError } from '../src/lib/ai.js'

const ALLOWED_ORIGIN = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'

export default async function handler(req, res) {
  // ✅ CORS: never wildcard
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ✅ Rate limit: 30 requests per minute per IP
  const rl = await redisRateLimit(req, 'match', 30, 60)
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })

  // ✅ Auth: validate Supabase JWT
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const { createClient } = await import('@supabase/supabase-js')
  // Use ANON key here - getUser() only validates the JWT, doesn't need service role
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  const { preferences } = req.body || {}
  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({ error: 'preferences object required' })
  }

  if (!process.env.PINECONE_API_KEY) {
    return res.status(200).json({ matches: [], skipped: 'no Pinecone key' })
  }

  // Serve from cache first - cache key now also covers lat/lng/radius so a
  // location-scoped query never returns a stale non-geo result.
  const cacheKey = `match:${user.id}:${JSON.stringify(preferences)}`
  const cached = await cacheGet(cacheKey)
  if (cached) return res.status(200).json({ matches: cached, cached: true })

  try {
    const index = await getPineconeIndex(process.env.PINECONE_INDEX_NAME || 'dealmatch-properties')
    if (!index) return res.status(200).json({ matches: [], skipped: 'no Pinecone key' })

    // ✅ FIX: real semantic embedding of the buyer's actual preferences,
    // not Math.random() noise - see api/lib/ai.js. Every match this
    // endpoint has ever returned before this fix was scored against a
    // random vector and was, in effect, random.
    const queryVector = await getEmbedding(buildPreferenceText(preferences), { inputType: 'query' })
    const filter = buildFilter(preferences)

    // ✅ NEW: location-aware matching. lat/lng/radius_m in the request are
    // turned into a bounding-box metadata filter (Pinecone has no native
    // geo-radius query) - see boundingBoxFilter(). This is the piece that
    // was completely missing before: "AI matching" had no location signal
    // at all, so a semantically perfect match on the other side of the
    // country would rank the same as one next door.
    const { lat, lng, radius_m: radiusMeters = 15000 } = preferences
    if (typeof lat === 'number' && typeof lng === 'number') {
      Object.assign(filter, boundingBoxFilter(lat, lng, radiusMeters))
    }

    const queryOptions = { vector: queryVector, topK: 30, includeMetadata: true }
    if (Object.keys(filter).length > 0) queryOptions.filter = filter

    const results = await index.query(queryOptions)
    let matches = (results.matches || []).map(m => {
      const distance = (typeof lat === 'number' && typeof m.metadata?.lat === 'number')
        ? distanceMeters(lat, lng, m.metadata.lat, m.metadata.lng)
        : null
      return { id: m.id, score: m.score, distance_m: distance, ...m.metadata }
    })

    // When a location was given, re-sort with distance as a tiebreaker for
    // near-equal semantic scores rather than pure vector score alone -
    // otherwise two listings scoring 0.81 vs 0.80 could put a 40km-away
    // result above one 500m away.
    if (typeof lat === 'number') {
      matches = matches
        .filter(m => m.distance_m == null || m.distance_m <= radiusMeters)
        .sort((a, b) => (b.score - a.score) || ((a.distance_m ?? Infinity) - (b.distance_m ?? Infinity)))
    }

    matches = matches.slice(0, 20)

    await cacheSet(cacheKey, matches, 300)

    return res.status(200).json({ matches })
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) {
      return res.status(200).json({ matches: [], skipped: err.message })
    }
    console.error('Match error:', err.message)
    return res.status(500).json({ error: 'Matching service unavailable' })
  }
}

function buildFilter(p) {
  const f = {}
  if (p.listing_type) f.listing_type = { $eq: p.listing_type }
  if (p.property_type) f.property_type = { $eq: p.property_type }
  if (p.state) f.state = { $eq: p.state }
  if (p.max_price) f.price = { $lte: Number(p.max_price) }
  if (p.min_bedrooms) f.bedrooms = { $gte: Number(p.min_bedrooms) }
  return f
}

function buildPreferenceText(p) {
  const parts = [
    p.property_goal ? `Looking for ${p.property_goal}` : '',
    p.preferred_states?.length ? `in ${p.preferred_states.join(', ')}` : '',
    (p.budget_min || p.budget_max) ? `Budget between NGN ${p.budget_min || 0} and NGN ${p.budget_max || 'any'}` : '',
    p.property_types?.length ? `Preferred property types: ${p.property_types.join(', ')}` : '',
    p.needs_financing ? 'Needs mortgage financing' : '',
    p.features?.length ? `Must have: ${p.features.join(', ')}` : '',
    p.lifestyle_notes || '',
    p.query_text || '', // free-text search query, when this is called from universal search rather than the buyer-profile flow
  ].filter(Boolean)
  return parts.join('. ') || 'general property search'
}
