// State machine for a payout_queue row (behavioural pattern).
//
// The allowed status changes live in one table, and every status write goes
// through movePayout(). The cron, the transfer webhook, reconciliation and the
// settlement code therefore cannot disagree about what may follow what.
//
// Two layers, on purpose:
//   - This file decides which moves are legal, and checks them before any write.
//   - The UPDATE itself is also conditional (.in('status', from)), so a row that
//     changed under us is not overwritten by a stale decision.
//
// The admin Payouts tab writes status directly through the browser client, so
// this table cannot stop that path. A database trigger would be the next step.

export const PAYOUT_TRANSITIONS = {
  pending:    ['processing', 'failed'], // send to Flutterwave, or give up before sending
  processing: ['paid', 'failed'],       // Flutterwave reported the outcome
  paid:       ['failed'],               // a reversal after the money was paid out
  failed:     ['pending'],              // an admin retries from the Payouts tab
}

export class IllegalPayoutTransition extends Error {
  constructor(from, to) {
    super(`A payout cannot move from ${from} to ${to}`)
    this.name = 'IllegalPayoutTransition'
  }
}

export function canTransition(from, to) {
  return (PAYOUT_TRANSITIONS[from] || []).includes(to)
}

// Every status that may move to `to`.
export function sourcesFor(to) {
  return Object.keys(PAYOUT_TRANSITIONS).filter((from) => canTransition(from, to))
}

// Move one payout row to `to`. `from` narrows the legal sources to the ones the
// caller is handling (for example, a transfer result only applies to a row that
// is processing). Returns true only if this call made the change.
export async function movePayout(svc, rowId, to, patch = {}, { from } = {}) {
  const sources = from ?? sourcesFor(to)
  for (const f of sources) {
    if (!canTransition(f, to)) throw new IllegalPayoutTransition(f, to)
  }
  const { data, error } = await svc
    .from('payout_queue')
    .update({ status: to, ...patch })
    .eq('id', rowId)
    .in('status', sources)
    .select('id')
  if (error) throw error
  return (data || []).length === 1
}
