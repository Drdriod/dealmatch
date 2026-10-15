// Run with: node --test src/lib/webhookRepository.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addLoyaltyPoints, markVirtualAccountPaid, findPayoutByGatewayRef, findInviterOf,
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
  const tables = { payment_virtual_accounts: [{ reference: 'va-1', status: 'pending', paid_kobo: 0 }] }
  const svc = fakeSupabase(tables)
  const first = await markVirtualAccountPaid(svc, 'va-1', 500000)
  assert.equal(first.data.length, 1)
  assert.equal(tables.payment_virtual_accounts[0].status, 'paid')
  const second = await markVirtualAccountPaid(svc, 'va-1', 500000)
  assert.equal(second.data.length, 0)
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
