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

// Not guarded by current status. This is the existing behaviour of the route; whether
// release should be limited to funded escrows is an open product question.
export function markEscrowReleased(svc, reference, nowIso) {
  return svc.from('escrow_transactions')
    .update({ status: 'released', released_at: nowIso })
    .eq('payment_ref', reference)
}

// Not guarded by current status. Same note as markEscrowReleased.
export function markEscrowRefunded(svc, reference) {
  return svc.from('escrow_transactions')
    .update({ status: 'refunded' })
    .eq('payment_ref', reference)
}
