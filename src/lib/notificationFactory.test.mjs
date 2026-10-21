// Run with: node --test src/lib/notificationFactory.test.mjs
// The expected wording below is copied from the messages users already receive.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNotification, insertNotification, NOTIFICATION_KINDS } from './notificationFactory.js'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

const at = new Date('2026-10-14T06:00:00.000Z')

test('referral cash copy matches what users already see', () => {
  const n = buildNotification('referral_cash', 'u1', { amount: 1500, level: 2 }, at)
  assert.equal(n.title, '💰 You earned N1,500 on DealMatch!')
  assert.equal(n.message, 'Someone in your referral network (Level 2) just closed a deal. N1,500 has been added to your pending earnings.')
  assert.equal(n.amount, 1500)
  assert.equal(n.link, '/referrals')
})

test('referral points copy matches', () => {
  const n = buildNotification('referral_points', 'u1', { points: 15, level: 1 }, at)
  assert.equal(n.title, '⭐ You earned 15 loyalty points!')
  assert.equal(n.message, 'A deal closed in your network (Level 1). 15 points have been added to your balance. Redeem 100 points for N10,000 cash anytime.')
  assert.equal(n.amount, 15)
})

test('escrow funded copy matches and links to the job', () => {
  const n = buildNotification('escrow_funded', 'u1', { amount: 250000, transactionId: 'tx-9' }, at)
  assert.equal(n.title, '🔒 Escrow funded')
  assert.equal(n.message, '₦250,000 is now held in escrow. Contact details have been unlocked.')
  assert.equal(n.link, '/jobs/tx-9')
})

test('payout copy is in naira, converted from kobo', () => {
  assert.equal(buildNotification('payout_paid', 'u1', { amountCents: 500000 }, at).message,
    '₦5,000 has been sent to your bank account.')
  assert.equal(buildNotification('payout_failed', 'u1', { amountCents: 500000 }, at).message,
    'Your payout of ₦5,000 did not reach your bank account. Our team has been notified and will contact you.')
  assert.equal(buildNotification('payout_failed_admin', 'a1', { payoutId: 7, amountCents: 500000 }, at).message,
    'Payout #7 of ₦5,000 failed. Review it in Payouts.')
})

test('stuck payout alert names the payout, transfer and status', () => {
  const n = buildNotification('payout_stuck', 'a1', { payoutId: 4, transferRef: 'payout-4', status: 'NEW' }, at)
  assert.equal(n.title, 'Payout still pending at Flutterwave')
  assert.equal(n.message, 'Payout #4 (transfer payout-4) is still NEW after three days. Check it with Flutterwave.')
  assert.equal(n.link, '/admin')
})

test('payment return copy depends on whether the payer overpaid or was short', () => {
  assert.equal(buildNotification('payment_return_overpaid', 'u1', { amountKobo: 120000 }, at).title,
    'We will return your extra payment')
  assert.equal(buildNotification('payment_return_short', 'u1', { amountKobo: 120000 }, at).message,
    'We received ₦1,200 of the price. Please contact us to complete or refund it.')
})

test('an unapplied payment tells the payer we will return it, and where to look', () => {
  const n = buildNotification('payment_return_unapplied', 'u1', { amountKobo: 500000 }, at)
  assert.equal(n.title, 'We could not apply your payment')
  assert.equal(n.message, 'We received ₦5,000, but it could not be applied to the job. We will return it to you.')
  assert.equal(n.link, '/wallet')
})

test('refund alert for staff points at Monetisation', () => {
  const n = buildNotification('refund_due', 'a1', { reason: 'overpaid', reference: 'REF-1', amountKobo: 250000 }, at)
  assert.equal(n.title, 'Money to return')
  assert.equal(n.message, 'overpaid payment REF-1: ₦2,500. Return it from Monetisation.')
  assert.equal(n.link, '/admin/monetisation')
})

test('every row has the same shape and a timestamp', () => {
  for (const kind of NOTIFICATION_KINDS) {
    const n = buildNotification(kind, 'u1', {
      amount: 1, level: 1, points: 1, transactionId: 't', amountCents: 100, amountKobo: 100,
      payoutId: 1, transferRef: 'r', status: 's', reason: 'overpaid', reference: 'r',
    }, at)
    assert.deepEqual(Object.keys(n).sort(), ['amount', 'created_at', 'link', 'message', 'title', 'type', 'user_id'], kind)
    assert.equal(n.type, kind)
    assert.equal(n.created_at, at.toISOString())
  }
})

test('an unknown kind is refused, not written', () => {
  assert.throws(() => buildNotification('referal_cash', 'u1', {}), /Unknown notification kind/)
  assert.throws(() => buildNotification('constructor', 'u1', {}), /Unknown notification kind/)
})

test('insertNotification writes one row and skips when there is no user', async () => {
  const svc = fakeSupabase({ notifications: [] })
  assert.equal(await insertNotification(svc, 'payout_paid', 'u1', { amountCents: 100 }), true)
  assert.equal(svc.log.inserts.length, 1)
  assert.equal(svc.log.inserts[0].rows[0].user_id, 'u1')
  assert.equal(await insertNotification(svc, 'payout_paid', null, { amountCents: 100 }), false)
  assert.equal(svc.log.inserts.length, 1)
})

test('a failed insert is logged and reported as false, never thrown', async () => {
  const failing = {
    from() {
      return { insert: async () => ({ data: null, error: new Error('db down') }) }
    },
  }
  const original = console.error
  console.error = () => {}
  try {
    assert.equal(await insertNotification(failing, 'payout_paid', 'u1', { amountCents: 100 }), false)
  } finally {
    console.error = original
  }
})
