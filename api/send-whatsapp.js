/**
 * /api/send-whatsapp  (also reachable as /api/whatsapp, see vercel.json)
 *
 * ONE serverless function for everything WhatsApp, so the project stays at
 * its function budget (scripts/check-architecture-fitness.mjs):
 *
 *   GET  ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 *        Meta's one-time webhook verification handshake.
 *   POST (header X-Hub-Signature-256)
 *        INBOUND webhook from Meta: a person messaged the DealMatch number.
 *        Signature-verified against the raw body, then handed to the
 *        conversation engine (src/modules/whatsapp).
 *   POST ?action=claim   (Bearer session)
 *        Binds the WhatsApp number behind a single-use link to the signed-in
 *        DealMatch account. Called by /wa/link in the web app.
 *   POST (Bearer session, body { userId, message })
 *        OUTBOUND: the original behaviour, unchanged. DealMatch pushes a
 *        message to a user (escrow.funded, dispute.opened, ...).
 *
 * Environment variables:
 *   WHATSAPP_CLOUD_API_TOKEN   system-user token (whatsapp_business_messaging)
 *   WHATSAPP_PHONE_NUMBER_ID   Cloud API phone_number_id (not the phone number)
 *   WHATSAPP_VERIFY_TOKEN      any long random string; same value goes in the Meta console
 *   WHATSAPP_APP_SECRET        Meta App > Settings > Basic > App secret
 *   WHATSAPP_ALLOWED_COUNTRY_CODES  optional, default "234"; comma list, or "*" for any
 *   WHATSAPP_GRAPH_VERSION     optional, default v23.0
 *
 * Why bodyParser is off: Meta signs the exact bytes it sends. Re-serialising a
 * parsed body (JSON.stringify) changes unicode escaping, so the signature can
 * only be checked against the raw body. The other two paths parse it themselves.
 *
 * Cloud API rule for the outbound path: free-form text only delivers if the
 * recipient messaged us in the last 24 hours. Outside that window use an
 * approved message template.
 */
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { redisRateLimit } from '../src/lib/redis.js'
import { createCloud, verifySignature } from '../src/modules/whatsapp/cloud.js'
import { createStore } from '../src/modules/whatsapp/store.js'
import { createEngine } from '../src/modules/whatsapp/engine.js'
import { findRecipientPhone, logOutboundMessage } from '../src/data/outboundMessageRepository.js'

export const config = { api: { bodyParser: false } }

const APP_URL = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng').replace(/\/+$/, '')
const ALLOWED_ORIGIN = APP_URL

function getServiceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
function getAnonClient(token) {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

function parseJson(raw, fallback = {}) {
  try { return JSON.parse(raw.toString('utf8')) } catch { return fallback }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

function allowedCountryCodes() {
  const raw = (process.env.WHATSAPP_ALLOWED_COUNTRY_CODES ?? '234').trim()
  if (raw === '*') return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function buildCloud() {
  return createCloud({
    token: process.env.WHATSAPP_CLOUD_API_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  })
}

// ── GET: Meta webhook verification ──────────────────────────────────────────
function handleVerify(req, res) {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && expected && safeEqual(token, expected)) {
    res.setHeader('Content-Type', 'text/plain')
    return res.status(200).send(String(challenge ?? ''))
  }
  return res.status(403).send('Forbidden')
}

// ── POST: inbound webhook from Meta ─────────────────────────────────────────
async function handleInbound(req, res, raw) {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) {
    console.error('whatsapp webhook: WHATSAPP_APP_SECRET not set')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }
  if (!raw.length) {
    console.error('whatsapp webhook: raw body unavailable (is config.api.bodyParser=false active?)')
    return res.status(400).json({ error: 'Empty body' })
  }
  if (!verifySignature(raw, req.headers['x-hub-signature-256'], secret)) {
    console.error('whatsapp webhook: invalid signature')
    return res.status(401).json({ error: 'Invalid signature' })
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('whatsapp webhook: Supabase env missing')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const body = parseJson(raw, null)
  // Always answer 200 once the signature is valid. A non-200 makes Meta retry
  // and eventually disable the webhook; duplicates are filtered by message id.
  if (!body || body.object !== 'whatsapp_business_account') return res.status(200).json({ ok: true })

  const engine = createEngine({
    store: createStore(getServiceClient()),
    cloud: buildCloud(),
    appUrl: APP_URL,
    allowedCountryCodes: allowedCountryCodes(),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
  })
  try {
    await engine.handleWebhook(body)
  } catch (err) {
    console.error('whatsapp webhook engine error:', err?.message || err)
  }
  return res.status(200).json({ ok: true })
}

// ── POST ?action=claim: link a WhatsApp number to the signed-in account ─────
async function handleClaim(req, res, raw) {
  const ipLimit = await redisRateLimit(req, 'wa_claim_ip', 20, 60)
  if (!ipLimit.allowed) return res.status(429).json({ error: 'Too many requests' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' })
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await getAnonClient(accessToken).auth.getUser(accessToken)
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  const userLimit = await redisRateLimit(req, `wa_claim_user:${user.id}`, 10, 60 * 60, false)
  if (!userLimit.allowed) return res.status(429).json({ error: 'Too many attempts. Try again later.' })

  const token = String(parseJson(raw).token || '')
  if (token.length < 20 || token.length > 200) return res.status(400).json({ error: 'invalid_or_expired' })

  const svc = getServiceClient()
  const store = createStore(svc)
  const result = await store.claimLinkToken(token, user.id)

  if (!result.ok) {
    const status = {
      invalid_or_expired: 400, contact_unavailable: 400, no_profile: 400,
      number_linked_elsewhere: 409, profile_already_linked: 409, account_restricted: 403,
    }[result.error] || 500
    return res.status(status).json({ error: result.error })
  }

  const contact = await store.getContact(result.waId)
  const tierInfo = await store.getTier(contact)

  // Best effort confirmation inside the WhatsApp chat (the 24h window is open:
  // the person messaged us minutes ago to get this link).
  const msg = tierInfo.tier === 'verified'
    ? 'Your DealMatch account is linked and you are already fully verified. You can contact providers now.'
    : 'Your DealMatch account is linked to this chat. One step left: finish identity verification on DealMatch to contact providers. Send VERIFY any time to check your status.'
  await buildCloud().sendText(result.waId, msg)

  const wa = result.waId
  return res.status(200).json({
    ok: true,
    tier: tierInfo.tier,
    identityStatus: tierInfo.identityStatus,
    waMasked: `+${wa.slice(0, 3)}***${wa.slice(-3)}`,
  })
}

// ── POST: original outbound send (unchanged behaviour) ──────────────────────
async function handleOutbound(req, res, raw) {
  const ipLimit = await redisRateLimit(req, 'send_whatsapp_ip', 15, 60)
  if (!ipLimit.allowed) return res.status(429).json({ error: 'Too many requests' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  const token = authHeader.replace('Bearer ', '')
  const anon = getAnonClient(token)
  const { data: { user }, error: authError } = await anon.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  const callerLimit = await redisRateLimit(req, `send_whatsapp_user:${user.id}`, 20, 60 * 60, false)
  if (!callerLimit.allowed) return res.status(429).json({ error: 'Too many messages triggered by this account this hour' })

  const { userId, message } = parseJson(raw)
  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message are required' })
  }
  if (String(message).length > 1000) {
    return res.status(400).json({ error: 'message too long' })
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const svc = getServiceClient()
  const { data: recipient } = await findRecipientPhone(svc, userId)
  if (!recipient?.phone) {
    return res.status(200).json({ sent: false, reason: 'recipient_has_no_phone' })
  }

  const apiToken      = process.env.WHATSAPP_CLOUD_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!apiToken || !phoneNumberId) {
    console.error('send-whatsapp: WHATSAPP_CLOUD_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set')
    return res.status(200).json({ sent: false, reason: 'whatsapp not configured' })
  }

  const to = String(recipient.phone).replace(/\D/g, '')
  const result = await createCloud({ token: apiToken, phoneNumberId }).sendText(to, String(message).slice(0, 1000))

  await logOutboundMessage(svc, {
    channel: 'whatsapp', sender_id: user.id, recipient: to,
    status: result.ok ? 'sent' : 'provider_error',
  })

  if (!result.ok) return res.status(200).json({ sent: false, reason: result.reason || 'cloud api error' })
  return res.status(200).json({ sent: true, id: result.id })
}

export default async function handler(req, res) {
  // Meta's verification handshake and webhook calls are server to server:
  // no CORS, no browser headers.
  if (req.method === 'GET') return handleVerify(req, res)

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const raw = await readRawBody(req)
  // If the body was already parsed upstream (bodyParser still on), recover the
  // JSON for the two authenticated paths. The webhook path never does this:
  // it needs the exact raw bytes or it fails closed.
  const rawForJson = raw.length || !req.body || typeof req.body !== 'object'
    ? raw
    : Buffer.from(JSON.stringify(req.body))

  if (req.headers['x-hub-signature-256']) return handleInbound(req, res, raw)
  if (req.query?.action === 'claim') return handleClaim(req, res, rawForJson)
  return handleOutbound(req, res, rawForJson)
}
