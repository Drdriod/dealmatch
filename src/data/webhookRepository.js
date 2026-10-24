// Repository (structural pattern) for server-side payment work: the Flutterwave
// webhook, referral payouts and virtual-account reconciliation. Every function takes
// the service-role client as its first argument, so the caller decides which client
// is used and tests can pass a fake.

// ── Referral chain ──

// The user who invited this user, if any.
export function findInviterOf(svc, userId) {
  return svc.from('profiles').select('id, invited_by').eq('id', userId).single()
}

export function insertReferralTransaction(svc, row) {
  return svc.from('referral_transactions').insert(row)
}

export function findLoyaltyPoints(svc, userId) {
  return svc.from('loyalty_points')
    .select('id, points_balance, points_lifetime')
    .eq('user_id', userId)
    .single()
}

export function insertLoyaltyPoints(svc, userId, points) {
  const now = new Date().toISOString()
  return svc.from('loyalty_points').insert({
    user_id: userId, points_balance: points, points_lifetime: points,
    created_at: now, updated_at: now,
  })
}

// Adds points without losing a concurrent update. The write only lands if the
// balance is still the one we read; otherwise it re-reads and tries again.
export async function addLoyaltyPoints(svc, userId, points, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const { data: existing } = await findLoyaltyPoints(svc, userId)
    if (!existing) {
      const { error } = await insertLoyaltyPoints(svc, userId, points)
      // A concurrent insert for the same user: loop and add to the row it created.
      if (!error) return true
      continue
    }
    const { data: updated } = await svc.from('loyalty_points').update({
      points_balance:  existing.points_balance + points,
      points_lifetime: existing.points_lifetime + points,
      updated_at:      new Date().toISOString(),
    })
      .eq('user_id', userId)
      .eq('points_balance', existing.points_balance)
      .eq('points_lifetime', existing.points_lifetime)
      .select('id')
    if (updated?.length) return true
  }
  return false
}

// ── Payments log ──

export function upsertPaymentRecord(svc, row) {
  return svc.from('payments').upsert(row, { onConflict: 'reference', ignoreDuplicates: true })
}

// ── Bank-transfer virtual accounts ──

export function findVirtualAccountByNumber(svc, accountNumber) {
  return svc.from('payment_virtual_accounts')
    .select('*')
    .eq('account_number', accountNumber)
    .maybeSingle()
}

// paid_kobo is NULL until the first credit, and `= 0` never matches NULL in SQL.
function sameTotal(query, row) {
  return row.paid_kobo == null ? query.is('paid_kobo', null) : query.eq('paid_kobo', Number(row.paid_kobo))
}

// A credit counts once. `countedIds` is the list of gateway charge ids already added to
// paid_kobo, so a retried or re-scanned charge is never added a second time. Each write is
// conditional on paid_kobo still being what the caller read, so two racing deliveries cannot
// both add to the same total. An expired account keeps its status: the money is recorded, the
// account is not revived.
export function markVirtualAccountUnderpaid(svc, row, totalKobo, countedIds) {
  return sameTotal(svc.from('payment_virtual_accounts')
    .update({
      status: row.status === 'expired' ? 'expired' : 'underpaid',
      paid_kobo: totalKobo,
      counted_charge_ids: countedIds,
    })
    .eq('reference', row.reference)
    .in('status', ['pending', 'underpaid', 'expired']), row)
    .select('reference')
}

// Returns the flipped row, or no rows if another delivery already completed it. A late full
// payment on an expired account also completes it: the purpose handler re-checks the record
// being paid for and puts the money on the refund list if that record can no longer take it.
export function markVirtualAccountPaid(svc, row, totalKobo, countedIds, chargeId) {
  return sameTotal(svc.from('payment_virtual_accounts')
    .update({
      status: 'paid',
      paid_kobo: totalKobo,
      paid_at: new Date().toISOString(),
      counted_charge_ids: countedIds,
      completing_charge_id: chargeId,
    })
    .eq('reference', row.reference)
    .in('status', ['pending', 'underpaid', 'expired']), row)
    .select('reference')
}

// ── Fulfilment: a paid account is finished once, by one runner at a time ──

// Takes the lease on a paid, unfulfilled account. Returns the claimed row, or no rows when the
// account is already fulfilled or another runner holds a lease that has not expired. A runner
// that crashed leaves its lease behind; it expires after leaseSeconds and the next runner takes over.
export async function claimVirtualAccountFulfilment(svc, reference, { leaseSeconds = 300, now = Date.now() } = {}) {
  const stamp = new Date(now).toISOString()
  const cutoff = new Date(now - leaseSeconds * 1000).toISOString()
  const base = () => svc.from('payment_virtual_accounts')
    .update({ fulfilment_claimed_at: stamp, fulfilment_error: null })
    .eq('reference', reference).eq('status', 'paid').is('fulfilled_at', null)
  const fresh = await base().is('fulfilment_claimed_at', null).select('reference')
  if (fresh.error || (fresh.data && fresh.data.length > 0)) return fresh
  return base().lt('fulfilment_claimed_at', cutoff).select('reference')
}

export function markVirtualAccountFulfilled(svc, reference) {
  return svc.from('payment_virtual_accounts')
    .update({ fulfilled_at: new Date().toISOString(), fulfilment_claimed_at: null, fulfilment_error: null })
    .eq('reference', reference).eq('status', 'paid')
}

// Gives the lease back after a failed run so the very next retry can take it. Only a short code
// is stored: clients can read their own row, so a database error message must not land here.
export function releaseVirtualAccountClaim(svc, reference) {
  return svc.from('payment_virtual_accounts')
    .update({ fulfilment_claimed_at: null, fulfilment_error: 'handler_failed' })
    .eq('reference', reference).eq('status', 'paid').is('fulfilled_at', null)
}

// Paid accounts nobody finished, oldest first. The caller skips rows whose lease is still live.
export function listUnfulfilledPaidAccounts(svc, limit = 25) {
  return svc.from('payment_virtual_accounts')
    .select('*')
    .eq('status', 'paid').is('fulfilled_at', null)
    .order('paid_at', { ascending: true })
    .limit(limit)
}

// Accounts that may still receive money: not yet paid, opened since `sinceIso`.
export function listOpenVirtualAccounts(svc, sinceIso, limit = 500) {
  return svc.from('payment_virtual_accounts')
    .select('*')
    .in('status', ['pending', 'underpaid', 'expired'])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit)
}

// "I have paid" button: at most one gateway lookup per account every `seconds`. Returns the
// row when this call won the slot, no rows when someone asked too recently.
export async function takeVerifySlot(svc, reference, { seconds = 15, now = Date.now() } = {}) {
  const stamp = new Date(now).toISOString()
  const cutoff = new Date(now - seconds * 1000).toISOString()
  const base = () => svc.from('payment_virtual_accounts')
    .update({ last_verify_at: stamp }).eq('reference', reference)
  const first = await base().is('last_verify_at', null).select('reference')
  if (first.error || (first.data && first.data.length > 0)) return first
  return base().lt('last_verify_at', cutoff).select('reference')
}

export async function paymentRecordExists(svc, reference) {
  const { data, error } = await svc.from('payments').select('reference').eq('reference', reference).maybeSingle()
  if (error) throw new Error('payments lookup failed: ' + error.message)
  return !!data
}

export function resolveUnderpaidRefunds(svc, reference) {
  return svc.from('payment_refunds')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('reference', reference).eq('reason', 'underpaid').eq('status', 'to_refund')
}

// ── Payout transfers ──

// The payout row a transfer event refers to. A success only applies to a row still
// in processing; a failure applies to any row with that reference.
export function findPayoutByGatewayRef(svc, transferCode, { processingOnly = false } = {}) {
  let q = svc.from('payout_queue').select('*').eq('gateway_ref', transferCode)
  if (processingOnly) q = q.eq('status', 'processing')
  return q.maybeSingle()
}
