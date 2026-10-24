// Run with: node --test src/lib/webhookRepository.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addLoyaltyPoints, markVirtualAccountPaid, markVirtualAccountUnderpaid, claimVirtualAccountFulfilment,
  markVirtualAccountFulfilled, takeVerifySlot, findPayoutByGatewayRef, findInviterOf,
} from '../data/webhookRepository.js'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

test('adds points to an existing loyalty row', async () => {
  const tables = { loyalty_points: [{ id: 1, user_id: 'u1', points_balance: 10, points_lifetime: 10 }] }
  assert.equal(await addLoyaltyPoints(fakeSupabase(tables), 'u1', 15), true)
  assert.equal(tables.loyalty_points[0].points_balance, 25)
  assert.equal(tables.loyalty_points[0].points_lifetime, 25)
})

test('creates the loyalty row when the user has none', async () => {
  const tables = { loyalty_points: [] }
  assert.equal(await addLoyaltyPoints(fakeSupabase(tables), 'u2', 5), true)
  assert.equal(tables.loyalty_points[0].points_balance, 5)
})

test('a balance changed between read and write is re-read, not overwritten', async () => {
  const tables = { loyalty_points: [{ id: 1, user_id: 'u1', points_balance: 10, points_lifetime: 10 }] }
  const base = fakeSupabase(tables)
  let loyaltyCalls = 0
  const svc = {
    ...base,
    from(table) {
      if (table === 'loyalty_points') {
        loyaltyCalls++
        // The second access is the update. Another webhook lands first: +100 to the balance.
        if (loyaltyCalls === 2) {
          tables.loyalty_points[0].points_balance += 100
          tables.loyalty_points[0].points_lifetime += 100
        }
      }
      return base.from(table)
    },
  }
  assert.equal(await addLoyaltyPoints(svc, 'u1', 15), true)
  // 10 + 100 from the other webhook + 15 from this one. A lost update would give 25.
  assert.equal(tables.loyalty_points[0].points_balance, 125)
  assert.equal(tables.loyalty_points[0].points_lifetime, 125)
})

test('a virtual account flips to paid once; a repeat delivery changes nothing', async () => {
  const tables = { payment_virtual_accounts: [{ reference: 'va-1', status: 'pending', paid_kobo: null }] }
  const svc = fakeSupabase(tables)
  const row = { reference: 'va-1', status: 'pending', paid_kobo: null } // what the first delivery read
  const first = await markVirtualAccountPaid(svc, row, 500000, ['c1'], 'c1')
  assert.equal(first.data.length, 1)
  assert.equal(tables.payment_virtual_accounts[0].status, 'paid')
  assert.equal(tables.payment_virtual_accounts[0].completing_charge_id, 'c1')
  const second = await markVirtualAccountPaid(svc, row, 500000, ['c1'], 'c1')
  assert.equal(second.data.length, 0)
})

test('a write that read a stale total changes nothing, so two deliveries cannot both add to it', async () => {
  const tables = { payment_virtual_accounts: [{ reference: 'va-2', status: 'underpaid', paid_kobo: 200000 }] }
  const svc = fakeSupabase(tables)
  const stale = { reference: 'va-2', status: 'underpaid', paid_kobo: 0 }
  assert.equal((await markVirtualAccountUnderpaid(svc, stale, 100000, ['x'])).data.length, 0)
  assert.equal(tables.payment_virtual_accounts[0].paid_kobo, 200000)
})

test('an expired account keeps its status when a short payment is recorded', async () => {
  const tables = { payment_virtual_accounts: [{ reference: 'va-3', status: 'expired', paid_kobo: null }] }
  const svc = fakeSupabase(tables)
  await markVirtualAccountUnderpaid(svc, { reference: 'va-3', status: 'expired', paid_kobo: null }, 100000, ['x'])
  assert.equal(tables.payment_virtual_accounts[0].status, 'expired')
  assert.equal(tables.payment_virtual_accounts[0].paid_kobo, 100000)
})

test('a fulfilment lease is taken by one runner, and taken over only after it expires', async () => {
  const tables = { payment_virtual_accounts: [{ reference: 'va-4', status: 'paid', fulfilled_at: null, fulfilment_claimed_at: null }] }
  const svc = fakeSupabase(tables)
  const t0 = Date.parse('2026-10-22T10:00:00Z')
  assert.equal((await claimVirtualAccountFulfilment(svc, 'va-4', { now: t0 })).data.length, 1)
  assert.equal((await claimVirtualAccountFulfilment(svc, 'va-4', { now: t0 + 60e3 })).data.length, 0)
  assert.equal((await claimVirtualAccountFulfilment(svc, 'va-4', { now: t0 + 301e3 })).data.length, 1)
  await markVirtualAccountFulfilled(svc, 'va-4')
  assert.equal((await claimVirtualAccountFulfilment(svc, 'va-4', { now: t0 + 900e3 })).data.length, 0)
})

test('the "I have paid" lookup is limited to one per account every 15 seconds', async () => {
  const tables = { payment_virtual_accounts: [{ reference: 'va-5', status: 'pending', last_verify_at: null }] }
  const svc = fakeSupabase(tables)
  const t0 = Date.parse('2026-10-22T10:00:00Z')
  assert.equal((await takeVerifySlot(svc, 'va-5', { now: t0 })).data.length, 1)
  assert.equal((await takeVerifySlot(svc, 'va-5', { now: t0 + 5e3 })).data.length, 0)
  assert.equal((await takeVerifySlot(svc, 'va-5', { now: t0 + 16e3 })).data.length, 1)
})

test('a transfer success only matches a row still processing; a failure matches any status', async () => {
  const tables = { payout_queue: [{ id: 1, gateway_ref: 'payout-1', status: 'paid' }] }
  const svc = fakeSupabase(tables)
  assert.equal((await findPayoutByGatewayRef(svc, 'payout-1', { processingOnly: true })).data, null)
  assert.equal((await findPayoutByGatewayRef(svc, 'payout-1')).data.id, 1)
})

test('the inviter lookup returns the invited_by value', async () => {
  const tables = { profiles: [{ id: 'u1', invited_by: 'u0' }] }
  assert.equal((await findInviterOf(fakeSupabase(tables), 'u1')).data.invited_by, 'u0')
})
