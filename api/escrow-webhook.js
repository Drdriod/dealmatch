// Escrow Webhook Handler
// Handles escrow state transitions (funded / released / refunded) from signed payment events
// Deployed as Vercel serverless function at /api/escrow-webhook

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { markEscrowFunded, markEscrowReleased, markEscrowRefunded } from '../src/data/escrowRepository.js'
import { log } from '../src/lib/logger.js'

// Read the body as raw bytes: the signature is over exactly what the sender sent.
export const config = { api: { bodyParser: false } }

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret    = process.env.ESCROW_WEBHOOK_SECRET
  const signature = req.headers['x-escrow-signature']

  // ✅ SECURITY FIX: this previously only verified the signature when BOTH
  // secret and signature were present - which meant an attacker could just
  // omit the signature header entirely and skip verification, then POST
  // arbitrary escrow.funded / escrow.released / escrow.refunded events for
  // any payment_ref with zero authentication. Fail closed: a missing or
  // unconfigured secret/signature is now always rejected, never bypassed.
  if (!secret) {
    console.error('ESCROW_WEBHOOK_SECRET not set')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' })
  }
  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch {
    return res.status(400).json({ error: 'Unreadable body' })
  }
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')
  const a = Buffer.from(hash)
  const b = Buffer.from(String(signature))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(400).json({ error: 'Invalid signature' })
  }

  let body
  try {
    body = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Malformed payload' })
  }
  const { event, data } = body || {}
  if (!event || !data) {
    return res.status(400).json({ error: 'Malformed payload' })
  }

  try {
    const supabase = getSupabase()
    const now = new Date().toISOString()

    // A failed write throws, so the sender gets a 500 and retries. Before, the
    // error was ignored and a lost update was acknowledged with 200.
    switch (event) {
      case 'escrow.funded': {
        const { reference } = data
        if (!reference) break
        const { error } = await markEscrowFunded(supabase, reference, now)
        if (error) throw error
        log.info('escrow.funded', { reference })
        break
      }

      case 'escrow.released': {
        const { reference } = data
        if (!reference) break
        const { data: changed, error } = await markEscrowReleased(supabase, reference, now)
        if (error) throw error
        // Only a funded escrow is released. Anything else is logged, not applied.
        if (changed?.length) log.info('escrow.released', { reference })
        else console.warn('Escrow release ignored (not funded, or unknown reference):', reference)
        break
      }

      case 'escrow.refunded': {
        const { reference } = data
        if (!reference) break
        const { data: changed, error } = await markEscrowRefunded(supabase, reference)
        if (error) throw error
        if (changed?.length) log.info('escrow.refunded', { reference })
        else console.warn('Escrow refund ignored (not funded, or unknown reference):', reference)
        break
      }

      // NOTE: there is deliberately no charge.success case here. Payments are
      // confirmed only by api/flutterwave-webhook.js, which checks the amount
      // paid. Funding an escrow from a second, unchecked path would bypass it.

      default:
        break
    }

    return res.status(200).json({ received: true })

  } catch (err) {
    console.error('Escrow webhook error:', err.message)
    return res.status(500).json({ error: 'Processing failed' })
  }
}
