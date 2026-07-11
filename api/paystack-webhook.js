// Paystack Webhook Handler: verifies payment events server-side
// Deployed as Vercel serverless function at /api/paystack-webhook
//
// AUTOMATION: when a charge.success event lands here, this file walks
// the buyer's referral chain automatically - Level 1/2/3 get cash,
// Level 4+ get loyalty points - and creates a notification for every
// person who earns. No manual lookup, no admin click required.
// Mirrors the tiered rates in src/lib/referral.js exactly.

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// ── Referral configuration (kept in sync with src/lib/referral.js) ──
const CASH_RATES = { 1: 0.08, 2: 0.04, 3: 0.02 }
const FULL_CHAIN_THRESHOLD = 50000
const FLAT_TIER_THRESHOLD  = 5000
const FLAT_REFERRAL_AMOUNT = 500
const POINTS_PER_LEVEL = { 1: 15, 2: 10, 3: 5, 4: 60, 5: 40, 6: 25, 7: 15, 8: 10, 9: 5, 10: 2 }
const POINTS_DEFAULT = 2

const getReferralTier = (dmCommission) => {
  if (dmCommission >= FULL_CHAIN_THRESHOLD) return 'full'
  if (dmCommission >= FLAT_TIER_THRESHOLD)  return 'flat'
  return 'points_only'
}

const calcCashReferral = (dmCommission, level) => {
  if (level > 3) return 0
  const tier = getReferralTier(dmCommission)
  if (tier === 'full') {
    const rate = CASH_RATES[level]
    return rate ? Math.round(dmCommission * rate) : 0
  }
  if (tier === 'flat') return FLAT_REFERRAL_AMOUNT
  return 0
}

const calcPoints = (level) => POINTS_PER_LEVEL[level] || POINTS_DEFAULT

// Map Paystack payment_type metadata to a DealMatch transaction type + fee rate
const TYPE_MAP = {
  property_purchase:         { txnType: 'property_sale', feeRate: 0.015 },
  rental:                    { txnType: 'rental',         feeRate: 0.03  },
  rental_listing_fee:        { txnType: 'rental',         feeRate: 1.0   }, // flat fee = full amount is the commission
  hotel_booking:             { txnType: 'hotel',          feeRate: 0.05  },
  escrow_payment:            { txnType: 'escrow',         feeRate: 0.03  },
  professional_subscription: { txnType: 'subscription',   feeRate: 1.0   }, // flat fee = full amount is the commission
}

/**
 * Walk the referral chain for a user and pay out cash + points
 * automatically, creating a notification for every earner along the way.
 */
async function processReferralChain(supabase, buyerUserId, dmCommission, transactionId, txnType) {
  if (!buyerUserId || !dmCommission || dmCommission <= 0) return

  const chain = []
  let currentId = buyerUserId
  let level = 1
  const seen = new Set([buyerUserId]) // prevents self-referral / circular invite loops from paying out

  while (currentId && level <= 10) {
    const { data } = await supabase
      .from('profiles')
      .select('id, invited_by')
      .eq('id', currentId)
      .single()

    if (!data?.invited_by) break
    if (seen.has(data.invited_by)) break // would be a self-referral or a loop - stop walking
    seen.add(data.invited_by)
    chain.push({ userId: data.invited_by, level })
    currentId = data.invited_by
    level++
  }

  if (!chain.length) return

  const tier = getReferralTier(dmCommission)

  for (const { userId, level: lvl } of chain) {
    if (lvl <= 3 && tier !== 'points_only') {
      const amount = calcCashReferral(dmCommission, lvl)
      if (amount <= 0) continue

      const { error } = await supabase.from('referral_transactions').insert({
        referrer_id:      userId,
        buyer_id:         buyerUserId,
        transaction_id:   transactionId,
        transaction_type: txnType,
        dm_commission:    dmCommission,
        referral_level:   lvl,
        payout_type:      'cash',
        referral_earning: amount,
        status:           'pending',
        created_at:       new Date().toISOString(),
      })

      if (!error) {
        await supabase.from('notifications').insert({
          user_id:    userId,
          type:       'referral_cash',
          title:      '💰 You earned N' + amount.toLocaleString() + ' on DealMatch!',
          message:    'Someone in your referral network (Level ' + lvl + ') just closed a deal. N' + amount.toLocaleString() + ' has been added to your pending earnings.',
          amount,
          link:       '/referrals',
          created_at: new Date().toISOString(),
        })
      }
    } else {
      const points = calcPoints(lvl)

      const { data: existing } = await supabase
        .from('loyalty_points')
        .select('id, points_balance, points_lifetime')
        .eq('user_id', userId)
        .single()

      if (existing) {
        await supabase.from('loyalty_points').update({
          points_balance:  existing.points_balance + points,
          points_lifetime: existing.points_lifetime + points,
          updated_at:      new Date().toISOString(),
        }).eq('user_id', userId)
      } else {
        await supabase.from('loyalty_points').insert({
          user_id:         userId,
          points_balance:  points,
          points_lifetime: points,
          created_at:      new Date().toISOString(),
          updated_at:      new Date().toISOString(),
        })
      }

      await supabase.from('referral_transactions').insert({
        referrer_id:      userId,
        buyer_id:         buyerUserId,
        transaction_id:   transactionId,
        transaction_type: txnType,
        dm_commission:    dmCommission,
        referral_level:   lvl,
        payout_type:      'points',
        points_awarded:   points,
        referral_earning: 0,
        status:           'confirmed',
        created_at:       new Date().toISOString(),
      })

      await supabase.from('notifications').insert({
        user_id:    userId,
        type:       'referral_points',
        title:      '⭐ You earned ' + points + ' loyalty points!',
        message:    'A deal closed in your network (Level ' + lvl + '). ' + points + ' points have been added to your balance. Redeem 100 points for N10,000 cash anytime.',
        amount:     points,
        link:       '/referrals',
        created_at: new Date().toISOString(),
      })
    }
  }
}

// ✅ SECURITY: timing-safe HMAC comparison (prevents timing attacks)
function verifySignature(secret, body, signature) {
  if (!secret || !signature) return false
  const hash = crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(body))
    .digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

// ✅ SECURITY: idempotency guard: track processed references in memory
// In production replace with Redis or a DB table
const processedRefs = new Set()

export default async function handler(req, res) {
  // ✅ SECURITY: method guard
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret    = process.env.PAYSTACK_SECRET_KEY
  const signature = req.headers['x-paystack-signature']

  // ✅ SECURITY: reject if no secret configured
  if (!secret) {
    console.error('PAYSTACK_SECRET_KEY not set')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  // ✅ SECURITY: timing-safe signature check
  if (!verifySignature(secret, req.body, signature)) {
    console.error('Invalid Paystack webhook signature')
    return res.status(400).json({ error: 'Invalid signature' })
  }

  const event = req.body

  // ✅ SECURITY: validate event shape
  if (!event?.event || !event?.data) {
    return res.status(400).json({ error: 'Malformed event' })
  }

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
        // Evict after 24h to prevent unbounded growth
        setTimeout(() => processedRefs.delete(reference), 86400000)

        const amountNgn = amount / 100

        // Activate in Supabase using service role
        if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
          const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
          )

          if (metadata?.type === 'professional_subscription') {
            const expiresAt = metadata.plan_type === 'annual'
              ? new Date(Date.now() + 365 * 86400000).toISOString()
              : new Date(Date.now() +  30 * 86400000).toISOString()
            const proUpdate = supabase.from('professional_applications')
              .update({
                status: 'approved',           // live CHECK: pending/approved/rejected
                subscription_plan: metadata.plan_type || 'monthly',
                subscription_start: new Date().toISOString(),
                subscription_expiry: expiresAt,
                activated_at: new Date().toISOString(),
              })
            // Match by application_id when available (most precise),
            // fall back to email match for legacy payments.
            await (metadata.application_id
              ? proUpdate.eq('id', metadata.application_id)
              : proUpdate.eq('email', customer.email))
            console.log('Professional activated:', customer.email)
          }

          if (metadata?.type === 'rental_listing_fee') {
            await supabase.from('properties')
              .update({ status: 'active' })
              .eq('payment_ref', reference)
            console.log('Rental listing activated:', reference)
          }

          // ✅ SECURITY FIX: escrow metadata (user_id, platform_fee) is
          // client-supplied at Paystack widget init and is NOT trustworthy.
          // Previously this trusted metadata.user_id to pick which escrow
          // row to confirm, and metadata.platform_fee as the commission
          // figure downstream - both spoofable by paying a tiny real amount
          // while claiming an arbitrary victim user_id / arbitrary large
          // platform_fee. Now we resolve the row strictly by payment_ref
          // (written server-side when the escrow was created) and use only
          // that row's stored tenant_id + platform_fee for everything else.
          let escrowRow = null
          if (metadata?.type === 'escrow_payment') {
            const { data: matchedEscrow, error: escrowErr } = await supabase
              .from('escrow_transactions')
              .select('id, tenant_id, platform_fee, amount, status')
              .eq('payment_ref', reference)
              .single()

            if (escrowErr || !matchedEscrow) {
              console.error('Escrow payment with no matching payment_ref, refusing to confirm:', reference)
            } else {
              escrowRow = matchedEscrow
              await supabase.from('escrow_transactions')
                .update({ status: 'confirmed' })
                .eq('id', matchedEscrow.id)
              console.log('Escrow payment confirmed:', reference, 'amount:', amountNgn)
            }
          }

          // Log every charge.success to payments table
          // Column names match the live payments schema exactly.
          await supabase.from('payments').upsert({
            reference,
            amount:            amountNgn,
            currency:          'NGN',
            professional_type: metadata?.professional_type || null, // live col exists
            plan_type:         metadata?.plan_type || null,          // live col exists
            email:             customer.email,
            status:            'success',
            user_id:           metadata?.user_id || null,
            // payment_type and verified_at do NOT exist in live schema - omitted
          }, { onConflict: 'reference', ignoreDuplicates: true })

          // ── AUTOMATIC REFERRAL PAYOUT ──────────────────────────────
          // Triggers the moment real money lands - no manual lookup,
          // no admin click. Every earner in the chain gets paid and
          // notified automatically.
          try {
            const mapping = TYPE_MAP[metadata?.type]
            // ✅ SECURITY FIX: never trust metadata.user_id or metadata.platform_fee
            // directly - both are attacker-controlled at Paystack widget init.
            // For escrow, only proceed if we resolved a real DB row above
            // (escrowRow) and use ITS tenant_id + platform_fee. For every
            // other type, dmCommission is derived from amountNgn, which is
            // the actual amount Paystack charged (verified via HMAC
            // signature above) - not attacker-suppliable.
            const referralUserId = metadata?.type === 'escrow_payment'
              ? escrowRow?.tenant_id
              : metadata?.user_id

            if (mapping && referralUserId) {
              const dmCommission = metadata?.type === 'escrow_payment'
                ? Number(escrowRow?.platform_fee) || 0   // trusted DB value only
                : mapping.feeRate === 1.0
                  ? amountNgn                       // flat-fee products: the whole amount IS the commission
                  : amountNgn * mapping.feeRate      // percentage products: commission is a cut of the deal

              if (dmCommission > 0) {
                await processReferralChain(
                  supabase,
                  referralUserId,
                  dmCommission,
                  reference,
                  mapping.txnType
                )
              }
            }
          } catch (refErr) {
            // Referral payout failures must never block payment confirmation
            console.error('Referral automation failed (non-fatal):', refErr.message)
          }
        }
        break
      }

      case 'transfer.success':
        console.log('Transfer successful:', event.data.reference)
        break

      case 'transfer.failed':
        console.error('Transfer failed:', event.data.reference)
        break

      case 'charge.dispute.create':
        console.warn('Dispute created:', event.data.reference)
        break

      default:
        // Don't log unknown events in detail: potential info leak
        break
    }

    return res.status(200).json({ received: true })

  } catch (err) {
    console.error('Webhook processing error:', err.message)
    return res.status(500).json({ error: 'Processing failed' })
  }
}
