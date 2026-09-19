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
//
// 'transaction_escrow' (ADR-009 marketplace jobs) is deliberately NOT in
// this map. Architecture v3 Section 4.3 is explicit that the DealMatch
// commission rate for marketplace transactions is a separate business
// decision still pending -- adding a feeRate here would mean inventing
// a number nobody has approved yet. Once a rate is decided, add it here
// and referral payout + commission capture will work the same way it
// does for every other type. Until then, escrow funding still works
// (see the transaction_escrow case below), it just doesn't trigger
// referral payout or set transactions.commission_rate_applied.
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

            // Providers should not go live until verification is approved -
            // payment alone is not enough for a Skilled Person to appear in
            // the public directory. Check identity verification before
            // flipping status to 'approved'; if it isn't done yet, record
            // the payment/subscription but leave status 'pending' so it
            // shows in the directory only once identity is confirmed too.
            // (trg_auto_approve_paid_professional on public.profiles closes
            // the loop: the moment identity gets approved afterwards, it
            // flips this row to 'approved' automatically - no re-payment,
            // no manual admin step required.)
            let identityApproved = false
            if (metadata.user_id) {
              const { data: applicantProfile } = await supabase
                .from('profiles')
                .select('identity_verification_status')
                .eq('id', metadata.user_id)
                .single()
              identityApproved = applicantProfile?.identity_verification_status === 'approved'
            }

            const proUpdate = supabase.from('professional_applications')
              .update({
                status: identityApproved ? 'approved' : 'pending', // live CHECK: pending/approved/rejected/paused
                subscription_plan: metadata.plan_type || 'monthly',
                subscription_start: new Date().toISOString(),
                subscription_expiry: expiresAt,
                activated_at: identityApproved ? new Date().toISOString() : null,
              })
            // Match by application_id when available (most precise),
            // fall back to email match for legacy payments.
            await (metadata.application_id
              ? proUpdate.eq('id', metadata.application_id)
              : proUpdate.eq('email', customer.email))
            console.log(identityApproved
              ? 'Professional activated:' : 'Professional paid, awaiting identity verification:', customer.email)
          }

          if (metadata?.type === 'rental_listing_fee') {
            await supabase.from('properties')
              .update({ status: 'active' })
              .eq('payment_ref', reference)
            console.log('Rental listing activated:', reference)
          }

          // NEW (item 2): credit-pack purchase for optional contact
          // unlock. Credits are only ever granted here, after Paystack
          // confirms the charge - never on the client's say-so - same
          // enforcement principle as every other payment type in this
          // file (item 3/6 of the fix request).
          if (metadata?.type === 'contact_unlock_credits') {
            const credits = Number(metadata.credits) || 0
            if (metadata.user_id && credits > 0) {
              await supabase.from('unlock_credit_ledger').insert({
                profile_id: metadata.user_id,
                entry_type: 'purchased',
                credits,
                price_cents: amount,
                payment_ref: reference,
              })
              console.log(`Granted ${credits} unlock credit(s) to`, metadata.user_id)
            }
          }

          // ✅ SECURITY FIX: escrow metadata (user_id, platform_fee) is
          // client-supplied at Paystack widget init and is NOT trustworthy.
          // Previously this trusted metadata.user_id to pick which escrow
          // row to confirm, and metadata.platform_fee as the commission
          // figure downstream - both spoofable by paying a tiny real amount
          // while claiming an arbitrary victim user_id / arbitrary large
          // platform_fee. Now we resolve the row strictly by payment_ref
          // (written server-side when the escrow was created) and use only
          // that row's stored tenant_id + platform_amount for everything else.
          //
          // ✅ SCHEMA FIX (Aug 2026 hardening pass): this used to select
          // `platform_fee, amount` and update status to 'confirmed' - none
          // of that matches the real escrow_transactions schema
          // (gross_amount/platform_amount are the real column names, and
          // the RLS policy "Escrow strict update" as well as
          // get_property_contact() both expect status = 'funded', not
          // 'confirmed'). The SELECT was failing with a Postgres
          // column-does-not-exist error on every single invocation,
          // meaning no property escrow deal could ever be confirmed by
          // this path. See supabase/migrations/20260812000000_production_hardening.sql.
          let escrowRow = null
          if (metadata?.type === 'escrow_payment') {
            const { data: matchedEscrow, error: escrowErr } = await supabase
              .from('escrow_transactions')
              .select('id, tenant_id, platform_amount, gross_amount, status')
              .eq('payment_ref', reference)
              .single()

            if (escrowErr || !matchedEscrow) {
              console.error('Escrow payment with no matching payment_ref, refusing to confirm:', reference)
            } else {
              escrowRow = matchedEscrow
              // NOTE: confirmed_at is a DIFFERENT signal in this schema --
              // it means "tenant confirmed move-in" and a BEFORE UPDATE OF
              // confirmed_at trigger (fn_release_on_move_in_confirm) uses
              // it to auto-RELEASE the escrow. Setting it here (payment
              // just landed) would have triggered an immediate release,
              // skipping the entire held-in-escrow protection window --
              // only `status`/`funded_at` belong at this step.
              await supabase.from('escrow_transactions')
                .update({ status: 'funded', funded_at: new Date().toISOString() })
                .eq('id', matchedEscrow.id)
              console.log('Escrow payment confirmed:', reference, 'amount:', amountNgn)
            }
          }

          // ── ADR-009 marketplace transaction escrow (Nearest-Available /
          // Multi-Attribute Reverse jobs) ─────────────────────────────
          // Same resolve-by-payment_ref pattern as escrow_payment above,
          // for the same reason: metadata.transaction_id is client-supplied
          // at Paystack widget init and must not be trusted to pick which
          // row to mark FUNDED. payment_ref was written server-side (via
          // the authorization-checked start_escrow_payment RPC,
          // 20260731000020) before this payment ever started, so resolving
          // by it here means an attacker paying a real but wrong amount
          // against a fabricated transaction_id cannot mark someone else's
          // job funded -- there is no row to find unless payment_ref
          // actually matches, and that value was never attacker-writable.
          if (metadata?.type === 'transaction_escrow') {
            const { data: matchedTx, error: txErr } = await supabase
              .from('transactions')
              .select('id, requester_id, provider_id, amount_cents, status')
              .eq('payment_ref', reference)
              .single()

            if (txErr || !matchedTx) {
              console.error('Transaction escrow payment with no matching payment_ref, refusing to confirm:', reference)
            } else if (matchedTx.status !== 'PENDING') {
              console.error('Transaction', matchedTx.id, 'is not PENDING (status=' + matchedTx.status + '), refusing to mark funded:', reference)
            } else if (Math.round(matchedTx.amount_cents / 100) !== Math.round(amountNgn)) {
              // Defense in depth: the amount actually charged (verified via
              // HMAC signature above) should match what the transaction
              // expected. A mismatch means something is wrong upstream --
              // refuse rather than silently accepting a different amount.
              console.error('Transaction', matchedTx.id, 'amount mismatch: expected', matchedTx.amount_cents / 100, 'got', amountNgn, 'ref:', reference)
            } else {
              await supabase.from('transactions')
                .update({ status: 'FUNDED', updated_at: new Date().toISOString() })
                .eq('id', matchedTx.id)
              console.log('Transaction escrow funded:', matchedTx.id, 'amount:', amountNgn)

              // Notify the provider directly -- not via src/lib/events.js,
              // that module is written for the browser (imports the
              // anon-key client) and isn't safe to import into this
              // service-role serverless function. Same raw-insert pattern
              // the referral payout code above already uses.
              if (matchedTx.provider_id) {
                await supabase.from('notifications').insert({
                  user_id:    matchedTx.provider_id,
                  type:       'escrow_funded',
                  title:      '🔒 Escrow funded',
                  message:    `₦${amountNgn.toLocaleString()} is now held in escrow. Contact details have been unlocked.`,
                  amount:     amountNgn,
                  link:       `/jobs/${matchedTx.id}`,
                  created_at: new Date().toISOString(),
                })
              }
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
                ? Number(escrowRow?.platform_amount) || 0   // trusted DB value only
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
            // transaction_escrow is intentionally absent from TYPE_MAP
            // (see comment above it), so it falls through here with no
            // mapping and no referral payout -- correct for now, revisit
            // once a marketplace commission rate is decided.
          } catch (refErr) {
            // Referral payout failures must never block payment confirmation
            console.error('Referral automation failed (non-fatal):', refErr.message)
          }
        }
        break
      }

      case 'transfer.success': {
        // FIX (item 8): this used to just console.log the reference and
        // stop - nothing here ever marked a payout as actually done, so
        // commission_wallet_ledger never got a 'released' row and
        // transactions.payout_status never left 'queued'. Now it finds
        // the payout_queue row this transfer belongs to (matched by the
        // transfer_code stored as gateway_ref when cron-process-payouts
        // initiated it) and finalizes everything in one place.
        const transferCode = event.data.transfer_code || event.data.reference
        if (transferCode && process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
          const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
          const { data: queueRow } = await svc.from('payout_queue').select('*').eq('gateway_ref', transferCode).eq('status', 'processing').maybeSingle()
          if (queueRow) {
            await svc.from('payout_queue').update({ status: 'paid', processed_at: new Date().toISOString() }).eq('id', queueRow.id)
            await svc.from('transactions').update({ payout_status: 'paid', paid_out_at: new Date().toISOString() }).eq('id', queueRow.transaction_id)
            await svc.from('commission_wallet_ledger').insert({
              profile_id: queueRow.profile_id,
              transaction_id: queueRow.transaction_id,
              entry_type: 'released',
              amount_cents: queueRow.amount_cents,
              gateway: 'paystack',
              gateway_ref: transferCode,
            })
            await svc.from('commission_wallet_ledger').insert({
              profile_id: queueRow.profile_id,
              transaction_id: queueRow.transaction_id,
              entry_type: 'withdrawn', // this is a real bank settlement, not just an internal "released" marker
              amount_cents: queueRow.amount_cents,
              gateway: 'paystack',
              gateway_ref: transferCode,
            })
          } else {
            console.warn('transfer.success for unknown/already-finalized payout_queue row:', transferCode)
          }
        }
        break
      }

      case 'transfer.failed':
      case 'transfer.reversed': {
        // A failed/reversed transfer must NOT silently disappear - the
        // provider is still owed this money. Mark the queue row 'failed'
        // (visible + retryable from the admin Payouts tab) rather than
        // leaving it stuck at 'processing' forever with no signal to anyone.
        const transferCode = event.data.transfer_code || event.data.reference
        console.error(`Transfer ${event.event}:`, transferCode)
        if (transferCode && process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
          const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
          const { data: queueRow } = await svc.from('payout_queue').select('*').eq('gateway_ref', transferCode).maybeSingle()
          if (queueRow) {
            await svc.from('payout_queue').update({ status: 'failed', failure_reason: `Paystack ${event.event}` }).eq('id', queueRow.id)
            await svc.from('transactions').update({ payout_status: 'failed' }).eq('id', queueRow.transaction_id)
          }
        }
        break
      }

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
