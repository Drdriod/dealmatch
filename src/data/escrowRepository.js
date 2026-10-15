// Repository for the escrow webhook (api/escrow-webhook.js). Each function takes the
// service-role client as its first argument and returns the Supabase result, so the
// handler decides how a failed write is reported and tests can pass a fake.

// Moves an escrow to funded, but only while it is still awaiting payment. A duplicate
// or late "funded" event therefore cannot move a released or refunded escrow back.
export function markEscrowFunded(svc, reference, nowIso) {
  return svc.from('escrow_transactions')
    .update({ status: 'funded', funded_at: nowIso })
    .eq('payment_ref', reference)
    .eq('status', 'awaiting_payment')
}

// Releases money, so it applies only to a funded escrow. A duplicate release finds
// nothing to change. The returned rows say whether anything moved: none means the escrow
// was not funded or does not exist, and the caller logs it.
export function markEscrowReleased(svc, reference, nowIso) {
  return svc.from('escrow_transactions')
    .update({ status: 'released', released_at: nowIso })
    .eq('payment_ref', reference)
    .eq('status', 'funded')
    .select('id')
}

// Refunds money, so it applies only to a funded escrow. Same return rule as markEscrowReleased.
export function markEscrowRefunded(svc, reference) {
  return svc.from('escrow_transactions')
    .update({ status: 'refunded' })
    .eq('payment_ref', reference)
    .eq('status', 'funded')
    .select('id')
}
