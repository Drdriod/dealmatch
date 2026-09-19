// /api/send-email - Transactional email sender (Resend)
// Used for referral payout / points award / escrow / dispute notifications.
// Requires RESEND_API_KEY env var. If not configured, fails silently
// (in-app notifications still work - email is a non-critical bonus channel).
//
// ✅ SECURITY FIX (Aug 2026 hardening pass): this endpoint previously had
// NO auth check, NO rate limit, and NO origin check, and trusted a raw
// client-supplied `to` address - meaning anyone who found the URL could
// relay unlimited email through DealMatch's Resend account to any address,
// with the message body interpolated into the HTML unescaped (email/HTML
// injection into DealMatch's own branded template). Fixed by:
//   - requiring a valid Supabase session (Bearer token)
//   - resolving the recipient server-side from `userId`, never trusting a
//     client-supplied `to` address directly
//   - Redis rate limiting per caller and per IP
//   - CORS restricted to the app's own origin
//   - HTML-escaping name/subject/message before interpolation
//   - logging every send to outbound_message_log for traceability

import { createClient } from '@supabase/supabase-js'
import { redisRateLimit } from '../src/lib/redis.js'

const ALLOWED_ORIGIN = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ipLimit = await redisRateLimit(req, 'send_email_ip', 15, 60)
  if (!ipLimit.allowed) return res.status(429).json({ error: 'Too many requests' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  const token = authHeader.replace('Bearer ', '')
  const anon = getAnonClient(token)
  const { data: { user }, error: authError } = await anon.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  const callerLimit = await redisRateLimit(req, `send_email_user:${user.id}`, 20, 60 * 60, false)
  if (!callerLimit.allowed) return res.status(429).json({ error: 'Too many emails triggered by this account this hour' })

  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const { userId, subject, message } = req.body || {}
  if (!userId || typeof userId !== 'string' || !subject || !message) {
    return res.status(400).json({ error: 'userId, subject, and message are required' })
  }
  if (String(subject).length > 200 || String(message).length > 5000) {
    return res.status(400).json({ error: 'subject or message too long' })
  }

  const svc = getServiceClient()

  // Recipient is always resolved server-side from userId - a client can
  // never direct this endpoint to email an arbitrary raw address. This
  // still allows the legitimate "notify a different user about my action"
  // case (e.g. referral payout, escrow funded) while removing the ability
  // to email addresses that aren't DealMatch account holders.
  const { data: recipient } = await svc.from('profiles').select('email, full_name').eq('id', userId).single()
  if (!recipient?.email) {
    return res.status(200).json({ sent: false, reason: 'recipient_has_no_email' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set - skipping email send')
    return res.status(200).json({ sent: false, reason: 'not_configured' })
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'DealMatch <notifications@dealmatch.com.ng>',
        to:      [recipient.email],
        subject: String(subject).slice(0, 200),
        html: '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">'
            + '<h2 style="color: #1A1210;">Hi ' + escapeHtml(recipient.full_name || 'there') + ',</h2>'
            + '<p style="color: #5C4A3A; font-size: 15px; line-height: 1.6;">' + escapeHtml(message) + '</p>'
            + '<a href="https://www.dealmatch.com.ng/referral" '
            + 'style="display:inline-block; margin-top:16px; padding:12px 24px; '
            + 'background-color:#C96A3A; color:#fff; text-decoration:none; '
            + 'border-radius:12px; font-weight:600;">View on DealMatch</a>'
            + '<p style="color: #8A7E78; font-size: 12px; margin-top: 32px;">DealMatch Technology Limited · Uyo, Akwa Ibom, Nigeria</p>'
            + '</div>',
      }),
    })

    await svc.from('outbound_message_log').insert({
      channel: 'email', sender_id: user.id, recipient: recipient.email,
      subject: String(subject).slice(0, 200), status: response.ok ? 'sent' : 'provider_error',
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Resend API error:', errText)
      return res.status(200).json({ sent: false, reason: 'provider_error' })
    }

    return res.status(200).json({ sent: true })

  } catch (err) {
    console.error('send-email error:', err.message)
    // Never 500 here - email is a non-critical bonus channel
    return res.status(200).json({ sent: false, reason: err.message })
  }
}
