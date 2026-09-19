/**
 * POST /api/send-whatsapp
 * Body: { userId: "<uuid>", message: "..." }
 *
 * Sends a text message via Meta's WhatsApp Cloud API. This is DealMatch
 * pushing a message OUT to a user (escrow.funded / dispute.opened, etc.).
 *
 * Requires two environment variables in Vercel:
 *   WHATSAPP_CLOUD_API_TOKEN   -- permanent or long-lived access token
 *   WHATSAPP_PHONE_NUMBER_ID   -- the Cloud API phone_number_id (not the
 *                                  human-readable number)
 *
 * Note on Cloud API rules: this sends a free-form text message, which
 * Meta only delivers if the recipient messaged the business within the
 * last 24 hours (the "customer service window"). Outside that window,
 * free-form sends are silently rejected and you must use a pre-approved
 * message template instead. Treat this as a bonus channel until template
 * messages are set up - notifications.js's email path is the guaranteed
 * fallback.
 *
 * ✅ SECURITY FIX (Aug 2026 hardening pass): this endpoint previously
 * accepted a raw client-supplied `phone` number with NO auth and NO rate
 * limit - anyone who found the URL could relay unlimited WhatsApp
 * messages to any number through DealMatch's Cloud API allowance. Fixed
 * the same way as send-email: requires a valid session, resolves the
 * recipient's phone server-side from `userId` (never trusts a
 * client-supplied number), rate-limits per caller and per IP, and logs
 * every send to outbound_message_log.
 */
import { createClient } from '@supabase/supabase-js'
import { redisRateLimit } from '../src/lib/redis.js'

const ALLOWED_ORIGIN = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

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

  const { userId, message } = req.body || {}
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
  const { data: recipient } = await svc.from('profiles').select('phone').eq('id', userId).single()
  if (!recipient?.phone) {
    return res.status(200).json({ sent: false, reason: 'recipient_has_no_phone' })
  }

  const apiToken       = process.env.WHATSAPP_CLOUD_API_TOKEN
  const phoneNumberId  = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!apiToken || !phoneNumberId) {
    console.error('send-whatsapp: WHATSAPP_CLOUD_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set')
    return res.status(200).json({ sent: false, reason: 'whatsapp not configured' })
  }

  const to = String(recipient.phone).replace(/\D/g, '')

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: String(message).slice(0, 1000) },
        }),
      }
    )

    const data = await resp.json()

    await svc.from('outbound_message_log').insert({
      channel: 'whatsapp', sender_id: user.id, recipient: to,
      status: resp.ok ? 'sent' : 'provider_error',
    })

    if (!resp.ok) {
      console.error('send-whatsapp: Cloud API error', data)
      return res.status(200).json({ sent: false, reason: data?.error?.message || 'cloud api error' })
    }

    return res.status(200).json({ sent: true, id: data?.messages?.[0]?.id })
  } catch (err) {
    console.error('send-whatsapp error:', err.message)
    return res.status(200).json({ sent: false, reason: 'network error' })
  }
}
