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

export function markVirtualAccountUnderpaid(svc, reference, totalKobo) {
  return svc.from('payment_virtual_accounts')
    .update({ status: 'underpaid', paid_kobo: totalKobo })
    .eq('reference', reference)
    .in('status', ['pending', 'underpaid'])
}

// Returns the flipped row, or no rows if it was already paid by an earlier delivery.
export function markVirtualAccountPaid(svc, reference, totalKobo) {
  return svc.from('payment_virtual_accounts')
    .update({ status: 'paid', paid_kobo: totalKobo, paid_at: new Date().toISOString() })
    .eq('reference', reference)
    .in('status', ['pending', 'underpaid'])
    .select('reference')
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
