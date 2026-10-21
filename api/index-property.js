// api/index-property.js - Index a property listing in Pinecone
// Vercel serverless function: POST /api/index-property

import { redisRateLimit } from '../src/lib/redis.js'
import { getEmbedding, getPineconeIndex, EmbeddingUnavailableError } from '../src/lib/ai.js'
import { findPropertySellerId } from '../src/data/propertyRepository.js'

const ALLOWED_ORIGIN = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'

export default async function handler(req, res) {
  // ✅ CORS: never wildcard
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ✅ Rate limit: 20 requests per minute per IP
  const rl = await redisRateLimit(req, 'index_property', 20, 60)
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })

  // ✅ Auth: validate Supabase JWT
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const { property } = req.body || {}
  if (!property?.id || typeof property.id !== 'string') {
    return res.status(400).json({ error: 'property.id (string) required' })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  // ✅ Validate JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  // ✅ Ownership check: only owner can index their property
  const { data: existing, error: fetchErr } = await findPropertySellerId(supabase, property.id)

  if (fetchErr || !existing) return res.status(404).json({ error: 'Property not found' })
  if (existing.seller_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  if (!process.env.PINECONE_API_KEY) {
    return res.status(200).json({ success: true, skipped: 'no Pinecone key' })
  }

  try {
    const index = await getPineconeIndex(process.env.PINECONE_INDEX_NAME || 'dealmatch-properties')
    if (!index) return res.status(200).json({ success: true, skipped: 'no Pinecone key' })

    // ✅ FIX: real semantic embedding, not Math.random() noise (see
    // api/lib/ai.js). If PINECONE_API_KEY isn't set, fail loudly instead of
    // silently indexing garbage vectors that would poison every match.
    const vector = await getEmbedding(buildPropertyText(property), { inputType: 'passage' })

    const lat = Number(property.latitude)
    const lng = Number(property.longitude)
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng)

    await index.upsert([{
      id:     String(property.id),
      values: vector,
      metadata: {
        title:         String(property.title         || '').slice(0, 200),
        property_type: String(property.property_type || ''),
        listing_type:  String(property.listing_type  || ''),
        price:         Number(property.price)    || 0,
        state:         String(property.state     || ''),
        city:          String(property.city      || ''),
        bedrooms:      Number(property.bedrooms)  || 0,
        bathrooms:     Number(property.bathrooms) || 0,
        size_sqm:      Number(property.size_sqm)  || 0,
        features:  Array.isArray(property.features)  ? property.features.slice(0, 20)  : [],
        documents: Array.isArray(property.documents) ? property.documents.slice(0, 10) : [],
        has_cof_o: (property.documents || []).includes('Certificate of Occupancy (C of O)'),
        // ✅ NEW: lat/lng metadata so /api/match can pre-filter by a
        // bounding box around the searcher's location (see
        // api/lib/ai.js:boundingBoxFilter). Previously absent entirely -
        // "AI matching" had no location awareness at all.
        ...(hasLocation ? { lat, lng } : {}),
      },
    }])

    return res.status(200).json({ success: true, id: property.id })
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) {
      // Not a hard failure of the listing flow - the property still gets
      // saved to Postgres by the caller either way. Surface clearly so
      // ops knows AI matching is off, rather than pretending it indexed.
      console.warn('Skipping property indexing:', err.message)
      return res.status(200).json({ success: true, skipped: err.message })
    }
    // ✅ Never leak internal error details to client
    console.error('Pinecone index error:', err.message)
    return res.status(500).json({ error: 'Indexing service unavailable' })
  }
}

function buildPropertyText(p) {
  return [
    `${p.title} in ${p.city}, ${p.state}`,
    `${p.property_type} for ${p.listing_type}`,
    `Price: ₦${p.price}`,
    p.bedrooms  ? `${p.bedrooms} bedrooms`  : '',
    p.bathrooms ? `${p.bathrooms} bathrooms` : '',
    `Size: ${p.size_sqm} sqm`,
    p.features?.slice(0, 10).join(', ') || '',
    String(p.description || '').slice(0, 500),
  ].filter(Boolean).join('. ')
}
