// Settles one payout_queue row once Flutterwave has reported its transfer.
// Used by the transfer webhook AND the reconciliation pass in cron-process-payouts,
// so a payout is finished the same way whichever path learns about it first.
//
// Server only: takes a service-role Supabase client.
import { movePayout } from './payoutStates.js'
import { insertNotification } from './notificationFactory.js'

// outcome: 'paid' | 'failed'. Returns true only when this call made the change,
// so a webhook retry racing the reconciliation pass cannot double-count the money.
export async function settlePayout(svc, queueRow, outcome, reason = null) {
  const now = new Date().toISOString()

  if (outcome === 'paid') {
    // Only a row still 'processing' can be paid. movePayout makes this idempotent.
    const changed = await movePayout(svc, queueRow.id, 'paid', { processed_at: now }, { from: ['processing'] })
    if (!changed) return false

    await svc.from('transactions')
      .update({ payout_status: 'paid', paid_out_at: now })
      .eq('id', queueRow.transaction_id)
    for (const entry_type of ['released', 'withdrawn']) {
      await svc.from('commission_wallet_ledger').insert({
        profile_id: queueRow.profile_id,
        transaction_id: queueRow.transaction_id,
        entry_type, // 'withdrawn' is the real bank settlement; 'released' is the internal marker
        amount_cents: queueRow.amount_cents,
        gateway: 'flutterwave',
        gateway_ref: queueRow.gateway_ref,
      })
    }

    await insertNotification(svc, 'payout_paid', queueRow.profile_id, { amountCents: queueRow.amount_cents })
    return true
  }

  // Failed or reversed. The provider is still owed this money, so the row stays
  // visible and retryable from the admin Payouts tab.
  // A transfer result only applies to a row that was sent (processing) or paid (a reversal).
  const changed = await movePayout(
    svc, queueRow.id, 'failed',
    { failure_reason: `Flutterwave: ${reason || 'transfer failed'}`.slice(0, 500) },
    { from: ['processing', 'paid'] },
  )
  if (!changed) return false

  await svc.from('transactions').update({ payout_status: 'failed' }).eq('id', queueRow.transaction_id)

  await insertNotification(svc, 'payout_failed', queueRow.profile_id, { amountCents: queueRow.amount_cents })
  const { data: admins } = await svc.from('profiles').select('id').eq('role', 'superadmin')
  for (const a of admins || []) {
    await insertNotification(svc, 'payout_failed_admin', a.id, {
      payoutId: queueRow.id,
      amountCents: queueRow.amount_cents,
    })
  }
  return true
}
