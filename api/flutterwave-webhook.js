// Flutterwave V4 webhook handler: verifies payment and transfer events server-side
// Deployed as Vercel serverless function at /api/flutterwave-webhook
//
// Trust model:
//  - The flutterwave-signature header is HMAC-SHA256 (base64) of the RAW request
//    body, keyed with our secret hash. We check it before parsing anything.
//  - A valid signature still doesn't prove the payload is true, so each event is
//    re-fetched from the Flutterwave V4 API before anything is granted.
//  - Bank-transfer credits are matched to a payment by the virtual account
//    number that was credited (payment_virtual_accounts), not by a reference
//    supplied by the payer.
//
// The business logic below works on a normalised event shaped like:
//   { event: 'charge.success' | 'transfer.success' | 'transfer.failed',
//     data: { reference, amount (kobo), customer: { email }, metadata } }
// so referral, escrow, unlock-credit and payout handling is unchanged.

// Vercel must not parse the body: the signature is computed over the raw bytes.
export const config = { api: { bodyParser: false } }

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { paymentGateway } from '../src/lib/paymentGateway.js'
import { settlePayout } from '../src/lib/payoutSettlement.js'
import { creditToEvent, fulfilEvent } from '../src/lib/chargePipeline.js'
import { findPayoutByGatewayRef } from '../src/data/webhookRepository.js'

// ✅ SECURITY: timing-safe check of the flutterwave-signature header
// (HMAC-SHA256 base64 over the raw body, keyed with the secret hash)
function verifySignature(secretHash, rawBody, headerValue) {
  if (!secretHash || !headerValue) return false
  const expected = crypto.createHmac('sha256', secretHash).update(rawBody).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(headerValue))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

function getServiceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// A customer paid by bank transfer into one of our virtual accounts. Re-fetch the charge from the
// gateway (the webhook body is not trusted), then hand it to the shared pipeline, which matches it
// to our row, counts it once, and says whether the item is now to be granted.
async function normalizeChargeEvent(eventData) {
  const charge = await paymentGateway.getCharge(eventData.id)
  return creditToEvent(getServiceClient(), charge)
}

// A payout transfer finished. Re-fetch it and map to our payout reference.
async function normalizeTransferEvent(eventData) {
  const transfer = await paymentGateway.getTransfer(eventData.id)
  const reference = transfer?.reference
  if (!reference) return null
  // transfer_code carries our own payout reference: that is what
  // payout_queue.gateway_ref stores, so the handlers below match on it.
  if (transfer.status === 'SUCCESSFUL') {
    return { event: 'transfer.success', data: { reference, transfer_code: reference } }
  }
  if (transfer.status === 'FAILED') {
    return { event: 'transfer.failed', data: { reference, transfer_code: reference } }
  }
  return null
}

async function normalizeFlutterwaveEvent(body) {
  const type = body?.type
  const id = body?.data?.id
  if (!id) return null
  if (type === 'charge.completed') return normalizeChargeEvent(body.data)
  if (type === 'transfer.disburse' || type === 'transfer.completed') return normalizeTransferEvent(body.data)
  return null
}

// ✅ SECURITY: idempotency guard: track processed references in memory
// In production replace with Redis or a DB table
const processedRefs = new Set()

async function transferSucceeded(event) {
  // The payout_queue row this transfer belongs to is matched by the transfer
  // reference stored as gateway_ref when cron-process-payouts started it. The
  // settlement itself is shared with reconciliation (see payoutSettlement.js).
  const transferCode = event.data.transfer_code || event.data.reference
  if (transferCode && process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const svc = getServiceClient()
    const { data: queueRow } = await findPayoutByGatewayRef(svc, transferCode, { processingOnly: true })
    if (queueRow) {
      await settlePayout(svc, queueRow, 'paid')
    } else {
      console.warn('transfer.success for unknown/already-finalized payout_queue row:', transferCode)
    }
  }
}

// A failed or reversed transfer must NOT silently disappear: the provider is
// still owed the money. The queue row is marked failed (visible and retryable
// from the admin Payouts tab), not left at processing forever.
async function transferFailed(event) {
  const transferCode = event.data.transfer_code || event.data.reference
  console.error(`Transfer ${event.event}:`, transferCode)
  if (transferCode && process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const svc = getServiceClient()
    const { data: queueRow } = await findPayoutByGatewayRef(svc, transferCode)
    if (queueRow) {
      await settlePayout(svc, queueRow, 'failed', event.event)
    }
  }
}

// Strategy (behavioural pattern): one handler per transfer outcome. This table
// is the only place that decides which handler runs for a transfer event.
const TRANSFER_STRATEGIES = {
  'transfer.success': transferSucceeded,
  'transfer.failed': transferFailed,
  'transfer.reversed': transferFailed,
}

export default async function handler(req, res) {
  // ✅ SECURITY: method guard
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH
  if (!secretHash || !process.env.FLUTTERWAVE_V4_CLIENT_ID || !process.env.FLUTTERWAVE_V4_CLIENT_SECRET || !process.env.FLUTTERWAVE_BASE_URL) {
    console.error('Flutterwave webhook environment is not configured')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch {
    return res.status(400).json({ error: 'Unreadable body' })
  }

  // ✅ SECURITY: check the signature over the raw bytes before trusting anything
  if (!verifySignature(secretHash, rawBody, req.headers['flutterwave-signature'])) {
    console.error('Invalid Flutterwave webhook signature')
    return res.status(400).json({ error: 'Invalid signature' })
  }

  let body
  try {
    body = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Malformed event' })
  }

  // ✅ SECURITY: validate event shape
  if (!body?.type || !body?.data) {
    return res.status(400).json({ error: 'Malformed event' })
  }

  let event
  try {
    event = await normalizeFlutterwaveEvent(body)
  } catch (err) {
    // Flutterwave API unreachable or refused: return 500 so Flutterwave retries
    console.error('Flutterwave re-verification failed:', err.message)
    return res.status(500).json({ error: 'Verification failed' })
  }
  if (!event) {
    // Not an event we act on, or Flutterwave does not confirm it
    return res.status(200).json({ received: true, ignored: true })
  }

  // The charge reference this request claimed in processedRefs, so a failure can release it.
  let claimedRef = null

  try {
    switch (event.event) {

      case 'charge.success': {
        const { reference, amount, customer, metadata } = event.data
        if (!reference) break

        // ✅ SECURITY: idempotency: skip already-processed references
        if (processedRefs.has(reference)) {
          console.log('Duplicate webhook, skipping:', reference)
          break
        }
        processedRefs.add(reference)
        claimedRef = reference
        // Evict after 24h to prevent unbounded growth
        // unref: this timer must never keep the process alive (it would stall a test run for a day).
        setTimeout(() => processedRefs.delete(reference), 86400000).unref?.()

        // Everything a confirmed payment does lives in src/lib/chargePipeline.js, shared with the
        // "I have paid" button and the background job. A failure throws and answers 500 below; the
        // pipeline has already given the account's lease back so the retry can finish it.
        await fulfilEvent(getServiceClient(), event)
        break
      }

      case 'transfer.success':
      case 'transfer.failed':
      case 'transfer.reversed':
        await TRANSFER_STRATEGIES[event.event](event)
        break

            default:
        // Don't log unknown events in detail: potential info leak
        break
    }

    return res.status(200).json({ received: true })

  } catch (err) {
    console.error('Webhook processing error:', err.message)
    // Answering 500 asks Flutterwave to send this again. Release the claim first, or a retry that
    // reaches this same warm instance would be skipped as a duplicate and answered 200, and the
    // charge would never be processed.
    if (claimedRef) processedRefs.delete(claimedRef)
    return res.status(500).json({ error: 'Processing failed' })
  }
}
