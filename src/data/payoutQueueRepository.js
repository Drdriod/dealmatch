// Repository for the payout queue, used by the payout cron (api/platform.js).
// Moving a payout's status goes through movePayout or settlePayout in src/lib; this
// file holds the reads and the bookkeeping writes around them. Service-role client only.

// Queued payouts still to send. Rows at the attempt limit wait for an admin.
export function findPendingPayouts(svc) {
  return svc.from('payout_queue')
    .select('id, transaction_id, profile_id, payout_account_id, amount_cents, attempts')
    .eq('status', 'pending')
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(20)
}

export function incrementPayoutAttempts(svc, row) {
  return svc.from('payout_queue').update({ attempts: row.attempts + 1 }).eq('id', row.id)
}

export function findPayoutTransaction(svc, transactionId) {
  return svc.from('transactions')
    .select('id, status, payout_status, provider_payout_account_id, amount_cents, commission_amount_cents')
    .eq('id', transactionId)
    .maybeSingle()
}

// Only a verified account can be paid.
export function findVerifiedPayoutAccount(svc, accountId) {
  return svc.from('payout_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('status', 'verified')
    .maybeSingle()
}

export function saveRecipientCode(svc, accountId, recipientId) {
  return svc.from('payout_accounts').update({ gateway_recipient_code: recipientId }).eq('id', accountId)
}

export function saveTransactionPayoutRef(svc, transactionId, payoutRef) {
  return svc.from('transactions').update({ payout_ref: payoutRef }).eq('id', transactionId)
}

export function saveFailureReason(svc, rowId, failureReason) {
  return svc.from('payout_queue').update({ failure_reason: failureReason }).eq('id', rowId)
}

export function markTransactionPayoutFailed(svc, transactionId) {
  return svc.from('transactions').update({ payout_status: 'failed' }).eq('id', transactionId)
}

// Payouts sent but not yet confirmed, older than the cutoff.
export function findStuckProcessingPayouts(svc, cutoffIso) {
  return svc.from('payout_queue')
    .select('id, transaction_id, profile_id, amount_cents, gateway_ref, created_at')
    .eq('status', 'processing')
    .lt('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(20)
}

export function findTransactionPayoutRef(svc, transactionId) {
  return svc.from('transactions').select('payout_ref').eq('id', transactionId).maybeSingle()
}

// Returns a row when a stuck-payout alert was already sent for this payout.
export function findStuckPayoutAlert(svc, payoutId) {
  return svc.from('notifications')
    .select('id')
    .eq('type', 'payout_stuck')
    .ilike('message', `%payout #${payoutId} %`)
    .limit(1)
}

export function findSuperadmins(svc) {
  return svc.from('profiles').select('id').eq('role', 'superadmin')
}
