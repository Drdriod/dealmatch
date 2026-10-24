// Charge pipeline: everything that happens after a bank-transfer credit is confirmed.
//
// One path, three callers: the Flutterwave webhook, the payer's "I have paid" button
// (platform.js, resource verify-payment) and the background reconciliation job. They differ only in
// how they find the charge; they all end in creditToEvent() then fulfilEvent(), so a payment is
// counted once and granted once however many of them see it.
//
// Safe to repeat: every purpose handler writes conditionally on the current state (see
// chargePurposes.js), the payments row is an ignore-duplicates upsert, and referral payout runs
// only for the first run that records the payment. A paid account that was not fulfilled (the
// handler failed) is finished by the next caller that takes its lease.
import { paymentGateway } from './paymentGateway.js'
import { insertNotification } from './notificationFactory.js'
import { recordMoneyToReturn, runChargePurpose } from './chargePurposes.js'
import {
  findInviterOf, insertReferralTransaction, addLoyaltyPoints, upsertPaymentRecord,
  findVirtualAccountByNumber, markVirtualAccountUnderpaid, markVirtualAccountPaid,
  resolveUnderpaidRefunds, claimVirtualAccountFulfilment, markVirtualAccountFulfilled,
  releaseVirtualAccountClaim, paymentRecordExists, listUnfulfilledPaidAccounts,
  listOpenVirtualAccounts,
} from '../data/webhookRepository.js'

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

// Map payment_type metadata to a DealMatch transaction type + fee rate
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
    const { data } = await findInviterOf(supabase, currentId)

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

      const { error } = await insertReferralTransaction(supabase, {
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
        await insertNotification(supabase, 'referral_cash', userId, { amount, level: lvl })
      }
    } else {
      const points = calcPoints(lvl)

      await addLoyaltyPoints(supabase, userId, points)

      await insertReferralTransaction(supabase, {
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

      await insertNotification(supabase, 'referral_points', userId, { points, level: lvl })
    }
  }
}

// A customer paid by bank transfer into one of our virtual accounts. `charge` is a charge the
// gateway itself returned for a lookup by id (never a webhook body). Matches it to our row by
// account number, counts it once, and returns the event to grant only once the full price is in.
// The amount in the event is always the PRICE, never what was received.
export async function creditToEvent(svc, charge) {
  if (charge?.status !== 'succeeded' || charge?.currency !== 'NGN') return null

  const accountNumber = charge.payment_method_details?.bank_transfer?.virtual_account_number
  if (!accountNumber) return null // card or other method: not a DealMatch virtual account

  const { data: row } = await findVirtualAccountByNumber(svc, accountNumber)
  if (!row) {
    console.warn('Credit to unknown virtual account:', accountNumber)
    return null
  }

  const paidKobo = Math.round(Number(charge.amount) * 100)
  const expectedKobo = Number(row.expected_kobo)
  const counted = Array.isArray(row.counted_charge_ids) ? row.counted_charge_ids : []

  if (row.status === 'paid') {
    // The same completing credit again, and the item was never granted: an unfinished delivery.
    // Take the lease and run the handlers again.
    if (!row.fulfilled_at && row.completing_charge_id && row.completing_charge_id === charge.id) {
      const { data: claimed } = await claimVirtualAccountFulfilment(svc, row.reference)
      if (!claimed || claimed.length === 0) return null // another runner has it, or it just finished
      return buildEvent(row, expectedKobo)
    }
    // A charge we already counted (a retry of an earlier credit): nothing new arrived.
    if (counted.includes(charge.id)) return null
    // A different transfer into an account that is already paid: never granted twice. The money
    // is returned to the payer.
    await recordMoneyToReturn(svc, row, paidKobo, 'overpaid', 'Transfer received after the payment was complete', 'charge:' + charge.id)
    return null
  }

  // A retried or re-scanned charge that is already in the running total is not added again.
  if (counted.includes(charge.id)) return null

  // Running total for this account. A second transfer tops up a short payment.
  const totalKobo = Number(row.paid_kobo || 0) + paidKobo
  const countedNow = [...counted, charge.id]
  if (totalKobo < expectedKobo) {
    const { data: moved } = await markVirtualAccountUnderpaid(svc, row, totalKobo, countedNow)
    if (!moved || moved.length === 0) return null // another delivery changed the total first
    await recordMoneyToReturn(svc, row, totalKobo, 'underpaid', 'Part payment held until topped up or returned', 'short:' + row.reference)
    console.warn('Underpaid virtual account payment:', row.reference, totalKobo, expectedKobo)
    return null
  }

  // Conditional update: only the first delivery of the completing credit flips the row
  const { data: flipped } = await markVirtualAccountPaid(svc, row, totalKobo, countedNow, charge.id)
  if (!flipped || flipped.length === 0) return null // already processed
  // Take the lease straight away so a retry that arrives mid-run does not start a second run.
  await claimVirtualAccountFulfilment(svc, row.reference)

  // The short payment is now complete, so it is no longer owed back.
  if (Number(row.paid_kobo || 0) > 0) {
    await resolveUnderpaidRefunds(svc, row.reference)
  }
  const excessKobo = totalKobo - expectedKobo
  if (excessKobo > 0) {
    await recordMoneyToReturn(svc, row, excessKobo, 'overpaid', 'Paid more than the price', 'charge:' + charge.id)
  }

  return buildEvent(row, expectedKobo)
}

function buildEvent(row, expectedKobo) {
  return {
    event: 'charge.success',
    virtualAccountReference: row.reference,
    data: {
      reference: row.reference,
      amount: expectedKobo, // the price the item costs, which is what was granted
      customer: { email: row.email },
      metadata: row.metadata || {},
    },
  }
}

// What a confirmed payment does: run the purpose handler, log the payment, pay the referral chain.
// Returns { outcome }: 'applied' | 'unapplied' | 'stopped' | 'repeat'. Throws when a write fails,
// so the caller can answer 500 (webhook) or try again later (job).
export async function applyChargeSuccess(supabase, { reference, amount, customer, metadata = {} }) {
  const amountNgn = amount / 100

  // Purpose handlers live in chargePurposes.js (registry).
  const purpose = await runChargePurpose(supabase, { reference, amount, customer, metadata })
  const escrowRow = purpose.escrowRow || null
  if (purpose.stop) return { outcome: 'stopped' }

  // A payments row from an earlier run means that run got as far as the referral step.
  const alreadyRecorded = await paymentRecordExists(supabase, reference)

  // Log every charge.success to payments table.
  // Column names match the live payments schema exactly.
  await upsertPaymentRecord(supabase, {
    reference,
    amount:            amountNgn,
    currency:          'NGN',
    professional_type: metadata?.professional_type || null,
    plan_type:         metadata?.plan_type || null,
    email:             customer.email,
    // 'success' unless the handler says the money was not applied (see chargePurposes.js).
    // Admin revenue totals count 'success' only.
    status:            purpose.paymentStatus || 'success',
    user_id:           metadata?.user_id || null,
  })

  // Money that was not applied to anything is on the refund list and earns no referral.
  if (purpose.paymentStatus === 'unapplied') return { outcome: 'unapplied' }
  // Referral payout has no unique key, so it runs only for the first run that recorded the payment.
  if (alreadyRecorded) return { outcome: 'repeat' }

  // ── AUTOMATIC REFERRAL PAYOUT ──────────────────────────────
  // Triggers the moment real money lands: no manual lookup, no admin click.
  try {
    const mapping = TYPE_MAP[metadata?.type]
    // SECURITY: never trust metadata.user_id or metadata.platform_fee directly: both are
    // attacker-controlled at widget init. For escrow, proceed only if a real DB row was resolved
    // (escrowRow) and use ITS tenant_id + platform_fee. For every other type, dmCommission is
    // derived from the amount the gateway confirmed.
    const referralUserId = metadata?.type === 'escrow_payment'
      ? escrowRow?.tenant_id
      : metadata?.user_id

    if (mapping && referralUserId) {
      const dmCommission = metadata?.type === 'escrow_payment'
        ? Number(escrowRow?.platform_amount) || 0   // trusted DB value only
        : metadata?.type === 'hotel_booking'
          ? Number(metadata.platform_fee_ngn) || 0  // the fee the server priced, not a rate here
        : mapping.feeRate === 1.0
          ? amountNgn                       // flat-fee products: the whole amount IS the commission
          : amountNgn * mapping.feeRate      // percentage products: commission is a cut of the deal

      if (dmCommission > 0) {
        await processReferralChain(supabase, referralUserId, dmCommission, reference, mapping.txnType)
      }
    }
    // transaction_escrow is intentionally absent from TYPE_MAP (see the comment above it).
  } catch (refErr) {
    // Referral payout failures must never block payment confirmation
    console.error('Referral automation failed (non-fatal):', refErr.message)
  }
  return { outcome: 'applied' }
}

// Runs a charge.success event to the end and records that the account was finished. On a failure
// the lease is given back, so the next retry can take it, and the error goes to the caller.
export async function fulfilEvent(svc, event) {
  const accountRef = event.virtualAccountReference
  try {
    const result = await applyChargeSuccess(svc, event.data)
    if (accountRef) {
      const { error } = await markVirtualAccountFulfilled(svc, accountRef)
      if (error) throw new Error('could not record fulfilment: ' + error.message)
    }
    return result
  } catch (err) {
    if (accountRef) {
      // Best effort: if this write fails too, the lease simply expires and the job finishes it.
      try { await releaseVirtualAccountClaim(svc, accountRef) } catch { /* lease expires */ }
    }
    throw err
  }
}

// Confirm a charge with the gateway, then count and grant it. Returns the outcome, or null when
// the charge is not a DealMatch credit or nothing new needed doing.
export async function processCharge(svc, charge) {
  const event = await creditToEvent(svc, charge)
  return event ? fulfilEvent(svc, event) : null
}

// ── Finishing and finding payments the webhook did not complete ──────────────────────────────

// A paid account whose handler failed or never finished. Re-reads the completing charge from the
// gateway (never trusts what we stored), then runs the same path. Returns a short status string.
export async function finishPaidAccount(svc, row, { gateway = paymentGateway } = {}) {
  if (row.status !== 'paid' || row.fulfilled_at) return 'already_done'
  if (!row.completing_charge_id) return 'needs_review' // paid before this was recorded: an admin decides
  const charge = await gateway.getCharge(row.completing_charge_id)
  if (charge?.payment_method_details?.bank_transfer?.virtual_account_number !== row.account_number) return 'needs_review'
  const result = await processCharge(svc, charge)
  return result ? 'finished' : 'busy'
}

// Looks through the newest gateway charges for credits to accounts that are still open, and
// feeds each one through the normal path. Catches a transfer whose webhook never arrived, and a
// transfer into an account that has since expired. Returns counts for the job's log.
export async function scanRecentCharges(svc, { gateway = paymentGateway, pages = 2, limit = 100, sinceMs = 48 * 3600e3, now = Date.now(), onlyRow = null } = {}) {
  let open = onlyRow ? [onlyRow] : null
  if (!open) {
    const res = await listOpenVirtualAccounts(svc, new Date(now - sinceMs).toISOString())
    if (res.error) throw new Error('could not list open accounts: ' + res.error.message)
    open = res.data || []
  }
  const byNumber = new Map(open.map((r) => [r.account_number, r]))
  const out = { scanned: 0, matched: 0, applied: 0, errors: 0 }
  if (byNumber.size === 0) return out

  for (let page = 1; page <= pages; page++) {
    const res = await gateway.listCharges({ page, limit })
    const list = Array.isArray(res) ? res : (res?.data || [])
    if (list.length === 0) break
    for (const item of list) {
      out.scanned++
      if (item?.status !== 'succeeded') continue
      const number = item?.payment_method_details?.bank_transfer?.virtual_account_number
      if (!number || !byNumber.has(number)) continue
      out.matched++
      try {
        // A listing is a summary: confirm the single charge before anything is granted.
        const charge = await gateway.getCharge(item.id)
        if (await processCharge(svc, charge)) out.applied++
      } catch (err) {
        out.errors++
        console.error('scanRecentCharges: charge', item.id, 'failed:', err.message)
      }
    }
    if (list.length < limit) break
  }
  return out
}

// The background job: finish unfinished paid accounts, then scan for credits nobody saw.
export async function reconcileVirtualAccounts(svc, opts = {}) {
  const { leaseSeconds = 300, now = Date.now(), gateway = paymentGateway } = opts
  const summary = { finished: 0, busy: 0, needs_review: 0, errors: 0, scan: null }

  const { data: stuck, error } = await listUnfulfilledPaidAccounts(svc)
  if (error) throw new Error('could not list unfulfilled accounts: ' + error.message)
  for (const row of stuck || []) {
    const leased = row.fulfilment_claimed_at && Date.parse(row.fulfilment_claimed_at) > now - leaseSeconds * 1000
    if (leased) { summary.busy++; continue }
    try {
      const status = await finishPaidAccount(svc, row, { gateway })
      if (status === 'finished') summary.finished++
      else if (status === 'needs_review') summary.needs_review++
      else summary.busy++
    } catch (err) {
      summary.errors++
      console.error('reconcileVirtualAccounts: account', row.reference, 'failed:', err.message)
    }
  }
  summary.scan = await scanRecentCharges(svc, { gateway, now })
  return summary
}

// The payer's "I have paid" button, for one of their own accounts. The caller has already checked
// that the account belongs to the signed-in user and has taken the rate-limit slot.
export async function verifyOwnPayment(svc, row, { gateway = paymentGateway } = {}) {
  if (row.status === 'paid' && row.fulfilled_at) return { state: 'paid' }
  if (row.status === 'paid') {
    const status = await finishPaidAccount(svc, row, { gateway })
    return { state: status === 'finished' ? 'paid' : status === 'needs_review' ? 'needs_review' : 'processing' }
  }
  const out = await scanRecentCharges(svc, { gateway, pages: 2, limit: 100, onlyRow: row })
  return { state: out.applied > 0 ? 'paid' : 'not_found_yet' }
}
