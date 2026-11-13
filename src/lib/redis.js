/**
 * Upstash Redis client: caching + server-side rate limiting
 * Used in Vercel API routes (server-side only)
 * Client-side uses clientRateLimit() from security.js
 */

// ─── Server-side Redis rate limiter (Vercel API routes) ───
//
// Fixed window: the first request in a window sets the expiry, so the window
// really resets. (The old code ran EXPIRE on every request, which kept the
// counter alive under steady traffic.)
//
// failClosed: use for payment, auth and verification routes. If Redis is
// unconfigured, unreachable, or returns an unexpected response in production,
// the request is DENIED. Other routes keep the default fail-open behaviour.
// memoryFallback: for sign-in routes. When Redis is unconfigured or down, count attempts in this
// server instance's memory instead of refusing everyone. It is weaker (each instance counts alone)
// but nobody is locked out of their own account because a storage service is missing.
const memoryHits = new Map()
function memoryLimit(rKey, max, windowSec) {
  const now = Date.now()
  if (memoryHits.size > 5000) for (const [k, v] of memoryHits) if (v.resetAt <= now) memoryHits.delete(k)
  const hit = memoryHits.get(rKey)
  if (!hit || hit.resetAt <= now) { memoryHits.set(rKey, { count: 1, resetAt: now + windowSec * 1000 }); return { allowed: true, remaining: max - 1 } }
  hit.count += 1
  return hit.count > max ? { allowed: false, remaining: 0, message: 'Too many requests' } : { allowed: true, remaining: max - hit.count }
}

export async function redisRateLimit(req, key, max = 20, windowSec = 60, includeIp = true, { failClosed = false, memoryFallback = false } = {}) {
  const upstashUrl   = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const isProd       = process.env.NODE_ENV === 'production'
  const denyOnFailure = failClosed && isProd

  if (!upstashUrl || !upstashToken) {
    if (memoryFallback) {
      console.error('[RATE LIMIT] Upstash unconfigured: using in-memory limit for', key)
      const ip0 = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
      return memoryLimit(includeIp ? `${key}:${ip0}` : key, max, windowSec)
    }
    if (denyOnFailure) {
      console.error('[RATE LIMIT] Upstash unconfigured on a fail-closed route')
      return { allowed: false, remaining: 0, message: 'Service temporarily unavailable. Please retry.' }
    }
    return { allowed: true, remaining: max }
  }

  // includeIp=false is used for identity-keyed limits (e.g. per-email login
  // attempts) where an attacker rotating IPs must NOT reset the counter.
  const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const rKey = includeIp ? `ratelimit:${key}:${ip}` : `ratelimit:${key}`

  const pipeline = async (commands) => {
    const res = await fetch(`${upstashUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    })
    if (!res.ok) throw new Error(`Upstash pipeline HTTP ${res.status}`)
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error('Upstash pipeline: unexpected response')
    return data
  }

  try {
    const [incr] = await pipeline([['INCR', rKey]])
    if (typeof incr?.result !== 'number') throw new Error('Upstash INCR: no numeric result')
    const count = incr.result

    // Start the window on the first hit only
    if (count === 1) {
      await pipeline([['EXPIRE', rKey, windowSec]])
    }

    if (count > max) {
      return { allowed: false, remaining: 0, message: 'Too many requests' }
    }
    return { allowed: true, remaining: max - count }
  } catch (err) {
    console.error('[RATE LIMIT] Redis error:', err?.message)
    if (memoryFallback) return memoryLimit(rKey, max, windowSec)
    if (denyOnFailure) {
      return { allowed: false, remaining: 0, message: 'Rate limit check failed. Please retry.' }
    }
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
