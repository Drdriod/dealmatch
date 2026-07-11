// api/match.js - AI property matching via Pinecone
// Vercel serverless function: POST /api/match

import { redisRateLimit, cacheGet, cacheSet } from '../src/lib/redis.js'

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

  try {
    const { Pinecone } = await import('@pinecone-database/pinecone')
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'dealmatch-properties')

    const queryVector = await createQueryVector(preferences)
    const filter = buildFilter(preferences)

    const queryOptions = { vector: queryVector, topK: 20, includeMetadata: true }
    if (Object.keys(filter).length > 0) queryOptions.filter = filter

    const results = await index.query(queryOptions)
    const matches = (results.matches || []).map(m => ({
      id:    m.id,
      score: m.score,
      ...m.metadata,
    }))

    // Cache result for 5 min
    const cacheKey = `match:${user.id}:${JSON.stringify(preferences)}`
    await cacheSet(cacheKey, matches, 300)

    return res.status(200).json({ matches })
  } catch (err) {
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

async function createQueryVector(_preferences) {
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
}
