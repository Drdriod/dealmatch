/**
 * Upstash Redis client: caching + server-side rate limiting
 * Used in Vercel API routes (server-side only)
 * Client-side uses clientRateLimit() from security.js
 */

// ─── Server-side Redis rate limiter (Vercel API routes) ───
export async function redisRateLimit(req, key, max = 20, windowSec = 60, includeIp = true) {
  const upstashUrl   = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!upstashUrl || !upstashToken) {
    // No Redis configured: allow through (fail open)
    return { allowed: true, remaining: max }
  }

  // includeIp=false is used for identity-keyed limits (e.g. per-email login
  // attempts) where an attacker rotating IPs must NOT reset the counter.
  const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const rKey = includeIp ? `ratelimit:${key}:${ip}` : `ratelimit:${key}`

  try {
    const res  = await fetch(`${upstashUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', rKey],
        ['EXPIRE', rKey, windowSec],
      ]),
    })
    const data = await res.json()
    const count = data[0]?.result || 1

    if (count > max) {
      return { allowed: false, remaining: 0, message: 'Too many requests' }
    }
    return { allowed: true, remaining: max - count }
  } catch {
    return { allowed: true, remaining: max }
  }
}

// ─── Cache helpers (Vercel API routes) ────────────────────
export async function cacheGet(key) {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    return data.result ? JSON.parse(data.result) : null
  } catch {
    return null
  }
}

export async function cacheSet(key, value, ttlSec = 300) {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return

  try {
    await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}?ex=${ttlSec}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {}
}

export async function cacheDel(key) {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return

  try {
    await fetch(`${url}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {}
}
