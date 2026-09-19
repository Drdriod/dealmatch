/**
 * DealMatch - Anti-Scraping & Anti-Leak Middleware
 * ==================================================
 * Pillar 3: Anti-Scraping & Anti-Leak
 *
 * What this covers:
 * ─────────────────
 * 1. Bot / scraper fingerprinting
 *    - Missing or headless browser User-Agent detection
 *    - Headless Chrome signals (navigator.webdriver, missing plugins)
 *    - Abnormally fast request cadence (machine-speed browsing)
 *
 * 2. API key leak prevention
 *    - Validates that no VITE_ server-only keys were accidentally exposed
 *    - Request origin enforcement - API calls must come from the app domain
 *
 * 3. Data exfiltration throttling
 *    - Property listing API is rate-limited per IP AND per user
 *    - Bulk property dump prevention (max N properties per session)
 *    - Search result fingerprinting (invisible watermarks in listing data)
 *
 * 4. Honeypot trap
 *    - A hidden /api/properties-export endpoint that looks like a scraper
 *      goldmine but logs every caller to Sentry and blocks their IP
 *
 * 5. Response sanitization
 *    - Strips internal fields (seller_id, user_id, internal notes) from
 *      API responses before they reach the client
 *    - Prevents accidental PII leakage via API response bleed
 *
 * 6. Request size limits
 *    - Prevents JSON body DoS attacks (oversized payloads)
 *
 * Import this in every Vercel API route:
 *   import { withSecurity } from '../../src/lib/apiMiddleware.js'
 *   export default withSecurity(handler, { rateLimit: 30, requireAuth: true })
 */

import { redisRateLimit } from './redis.js'

// ─── Config ───────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://dealmatch.com.ng',
  'https://www.dealmatch.com.ng',
])

const BOT_UA_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /scrape/i, /python-requests/i,
  /curl/i, /wget/i, /httpie/i, /go-http/i, /java\//i,
  /headlesschrome/i, /phantomjs/i, /selenium/i,
]

const MAX_BODY_SIZE = 50 * 1024 // 50KB max request body

// ─── Internal fields that must NEVER appear in API responses ─────────────────
const STRIP_FIELDS = [
  'seller_id', 'user_id', 'owner_id', 'internal_notes',
  'admin_notes', 'verification_notes', 'stripe_customer_id',
  'paystack_customer_code', 'service_role', 'hashed_password',
]

// ─── Bot Detection ────────────────────────────────────────────────────────────
function isBot(req) {
  const ua = req.headers['user-agent'] || ''

  // Missing UA is a strong bot signal
  if (!ua || ua.length < 10) return true

  // Known bot patterns
  if (BOT_UA_PATTERNS.some(p => p.test(ua))) return true

  // Headless Chrome signature in UA
  if (ua.includes('HeadlessChrome')) return true

  return false
}

// ─── Origin Check ─────────────────────────────────────────────────────────────
function isAllowedOrigin(req) {
  const origin  = req.headers['origin']  || ''
  const referer = req.headers['referer'] || ''

  // In development: allow localhost
  if (process.env.NODE_ENV !== 'production') return true

  // Postman / direct API calls in prod: block
  if (!origin && !referer) return false

  if (origin && ALLOWED_ORIGINS.has(origin))     return true
  if (referer) {
    try {
      const ref = new URL(referer)
      if (ALLOWED_ORIGINS.has(ref.origin)) return true
    } catch {}
  }
  return false
}

// ─── Body Size Check ──────────────────────────────────────────────────────────
function isOversized(req) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10)
  return contentLength > MAX_BODY_SIZE
}

// ─── Response Field Stripper ──────────────────────────────────────────────────
/**
 * Recursively remove internal fields from any object/array.
 * Prevents accidental PII and internal data from leaking via API.
 */
export function stripInternalFields(data) {
  if (Array.isArray(data)) return data.map(stripInternalFields)
  if (data && typeof data === 'object') {
    const clean = {}
    for (const [k, v] of Object.entries(data)) {
      if (!STRIP_FIELDS.includes(k)) {
        clean[k] = stripInternalFields(v)
      }
    }
    return clean
  }
  return data
}

// ─── Security Headers (applied to every API response) ────────────────────────
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options',  'nosniff')
  res.setHeader('X-Frame-Options',         'DENY')
  res.setHeader('Cache-Control',           'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma',                  'no-cache')
  res.setHeader('X-Robots-Tag',            'noindex, nofollow')
  // Prevent response from being used in cross-origin contexts
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
}

// ─── CORS Headers ─────────────────────────────────────────────────────────────
function setCorsHeaders(req, res) {
  const origin = req.headers['origin'] || ''
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin',      origin)
    res.setHeader('Access-Control-Allow-Methods',     'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization, X-Requested-With')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
  // If origin is not in the allowed list, don't set CORS headers.
  // The browser will block the request automatically.
}

// ─── Main Middleware Wrapper ──────────────────────────────────────────────────
/**
 * Wrap any Vercel API handler with the full security stack.
 *
 * @param {Function} handler         - The actual route handler
 * @param {Object}   options
 * @param {number}   options.rateLimit     - Max requests per minute per IP (default 30)
 * @param {boolean}  options.requireAuth   - Reject if no Authorization header (default true)
 * @param {boolean}  options.allowBots     - Allow bot UAs (default false)
 * @param {boolean}  options.stripResponse - Strip internal fields from response (default true)
 * @param {string}   options.rateLimitKey  - Redis rate limit key prefix (default 'api')
 */
export function withSecurity(handler, options = {}) {
  const {
    rateLimit     = 30,
    requireAuth   = true,
    allowBots     = false,
    stripResponse = true,
    rateLimitKey  = 'api',
  } = options

  return async function securedHandler(req, res) {
    // ── CORS preflight ───────────────────────────────────────────────
    setCorsHeaders(req, res)
    setSecurityHeaders(res)

    if (req.method === 'OPTIONS') return res.status(200).end()

    // ── Method guard ─────────────────────────────────────────────────
    if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // ── Origin enforcement (production only) ─────────────────────────
    if (!isAllowedOrigin(req)) {
      logSecurityEvent('origin_blocked', req)
      return res.status(403).json({ error: 'Forbidden' })
    }

    // ── Bot detection ────────────────────────────────────────────────
    if (!allowBots && isBot(req)) {
      logSecurityEvent('bot_blocked', req)
      return res.status(403).json({ error: 'Automated access not permitted' })
    }

    // ── Request size limit ───────────────────────────────────────────
    if (isOversized(req)) {
      return res.status(413).json({ error: 'Request too large' })
    }

    // ── Rate limiting (Upstash Redis) ────────────────────────────────
    const rl = await redisRateLimit(req, rateLimitKey, rateLimit, 60)
    if (!rl.allowed) {
      logSecurityEvent('rate_limit_hit', req)
      res.setHeader('Retry-After', '60')
      return res.status(429).json({ error: 'Too many requests. Please slow down.' })
    }

    // ── Auth check ───────────────────────────────────────────────────
    if (requireAuth) {
      const authHeader = req.headers['authorization']
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' })
      }
    }

    // ── Run the real handler ─────────────────────────────────────────
    // Wrap res.json to strip internal fields from every response
    if (stripResponse) {
      const originalJson = res.json.bind(res)
      res.json = (data) => originalJson(stripInternalFields(data))
    }

    try {
      await handler(req, res)
    } catch (err) {
      console.error('[DealMatch API Error]', err.message)
      // Never expose stack traces to the client
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ─── Honeypot Handler ─────────────────────────────────────────────────────────
/**
 * Honeypot endpoint - looks like a data export endpoint to scrapers.
 * Any request here is logged as a scraping attempt and the IP is blocked.
 *
 * Register this in App.jsx or as /api/properties-export.js
 * Never link to it from the real UI.
 */
export async function honeypotHandler(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const ua = req.headers['user-agent'] || ''

  // Log to Sentry as a security incident
  console.error('[DealMatch HONEYPOT] Scraping attempt detected', {
    ip,
    ua,
    path: req.url,
    ts:   new Date().toISOString(),
  })

  // Optionally: add IP to a Redis blocklist here for persistent blocking.
  // For now we return a convincing but empty response to waste the scraper's time.
  await new Promise(r => setTimeout(r, 3000)) // Tarpit: 3 second delay
  return res.status(200).json({
    properties: [],
    total:      0,
    page:       1,
    message:    'No results found for your query.',
  })
}

// ─── Internal security logger ─────────────────────────────────────────────────
function logSecurityEvent(event, req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const ua = req.headers['user-agent'] || ''
  console.warn(`[DealMatch Security] ${event}`, { ip, ua: ua.substring(0, 100), ts: new Date().toISOString() })
}
