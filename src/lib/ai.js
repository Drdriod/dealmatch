// api/lib/ai.js - shared real-embedding helper for AI matching.
//
// FIX (this pass): api/match.js and api/index-property.js each had their
// own createEmbedding()/createQueryVector() that did:
//   return Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
// i.e. pure random noise. Every "AI match" ever returned was scored
// against garbage vectors - Pinecone was doing real nearest-neighbour
// math, but on inputs with zero semantic meaning. This file is the one
// place that now calls a real embedding model, so every caller (property
// matching, the universal people+places listing matching added in this
// pass) gets an actual semantic vector.
//
// Uses Pinecone's own hosted inference API (multilingual-e5-large) rather
// than a separate embedding provider - this project already pays for
// Pinecone, so PINECONE_API_KEY is the only key this needs. No OpenAI
// account, no separate billing relationship, one less vendor.
//
// multilingual-e5-large is an "asymmetric" model: it embeds a listing's
// own text differently from a search query's text (inputType 'passage' vs
// 'query' below), which measurably improves retrieval quality for exactly
// this kind of short-query-against-longer-document matching.

const EMBEDDING_MODEL = 'multilingual-e5-large'
const EMBEDDING_DIMENSIONS = 1024 // fixed for this model - the Pinecone index must be created with dimension 1024, metric cosine

export class EmbeddingUnavailableError extends Error {}

/**
 * Get a real semantic embedding for a piece of text via Pinecone's hosted
 * inference API. Throws EmbeddingUnavailableError if PINECONE_API_KEY is
 * not configured - callers must handle this explicitly (e.g. skip AI
 * matching and fall back to keyword/attribute search) rather than
 * silently substituting a fake vector, which is the exact bug this file
 * fixes.
 *
 * @param {string} text
 * @param {{ inputType?: 'passage'|'query' }} [opts] - 'passage' when
 *   embedding a listing/property being indexed (the default), 'query'
 *   when embedding what a searcher typed. Getting this backwards doesn't
 *   error, it just quietly returns worse-ranked matches - so every call
 *   site passes it explicitly rather than relying on the default.
 */
export async function getEmbedding(text, { inputType = 'passage' } = {}) {
  const apiKey = process.env.PINECONE_API_KEY
  if (!apiKey) {
    throw new EmbeddingUnavailableError('PINECONE_API_KEY not configured - AI matching is disabled until it is set')
  }
  const input = String(text || '').slice(0, 2000) // stay well under the model's token limit
  if (!input.trim()) {
    throw new Error('Cannot embed empty text')
  }

  const { Pinecone } = await import('@pinecone-database/pinecone')
  const pinecone = new Pinecone({ apiKey })

  const result = await pinecone.inference.embed({
    model: EMBEDDING_MODEL,
    inputs: [input],
    parameters: { inputType, truncate: 'END' },
  })

  const vector = result?.data?.[0]?.values
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error('Embedding response did not have the expected shape')
  }
  return vector
}

/**
 * Approximate lat/lng bounding box for a given radius, used as a Pinecone
 * metadata pre-filter (Pinecone has no native geo-radius query, so a
 * bounding box on indexed lat/lng metadata numbers is the pragmatic
 * approach - it over-includes slightly at the box corners, which is fine
 * since the true distance is re-checked and used for sorting after the
 * vector query returns).
 */
export function boundingBoxFilter(lat, lng, radiusMeters) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !radiusMeters) return null
  const latDelta = radiusMeters / 111_320 // ~111.32km per degree latitude
  const lngDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180) || 1)
  return {
    lat: { $gte: lat - latDelta, $lte: lat + latDelta },
    lng: { $gte: lng - lngDelta, $lte: lng + lngDelta },
  }
}

/** Haversine distance in metres, used to re-rank/verify Pinecone's bounding-box results. */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number')) return null
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function getPineconeIndex(indexName) {
  const apiKey = process.env.PINECONE_API_KEY
  if (!apiKey) return null
  const { Pinecone } = await import('@pinecone-database/pinecone')
  const pinecone = new Pinecone({ apiKey })
  return pinecone.index(indexName)
}
