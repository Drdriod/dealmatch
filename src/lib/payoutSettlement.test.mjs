// Run with: node --test src/lib/payoutSettlement.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { settlePayout } from './payoutSettlement.js'
import { fakeSupabase as fakeSvc } from './testing/fakeSupabase.mjs'

const queued = (over = {}) => ({
  id: 7, transaction_id: 3, profile_id: 'prov-1', amount_cents: 500000,
  gateway_ref: 'payout-7', status: 'processing', ...over,
})

test('paid: flips the row once, writes both ledger rows, notifies the provider', async () => {
  const tables = {
    payout_queue: [queued()],
    transactions: [{ id: 3, payout_status: 'queued' }],
    commission_wallet_ledger: [],
    notifications: [],
  }
  const svc = fakeSvc(tables)
  assert.equal(await settlePayout(svc, queued(), 'paid'), true)
  assert.equal(tables.payout_queue[0].status, 'paid')
  assert.equal(tables.transactions[0].payout_status, 'paid')
  assert.deepEqual(tables.commission_wallet_ledger.map((r) => r.entry_type), ['released', 'withdrawn'])
  assert.equal(tables.notifications.length, 1)
  assert.equal(tables.notifications[0].user_id, 'prov-1')
  assert.equal(tables.notifications[0].type, 'payout_paid')
})

test('paid twice (webhook then reconciliation): money is recorded once', async () => {
  const tables = {
    payout_queue: [queued()],
    transactions: [{ id: 3, payout_status: 'queued' }],
    commission_wallet_ledger: [],
    notifications: [],
  }
  const svc = fakeSvc(tables)
  assert.equal(await settlePayout(svc, queued(), 'paid'), true)
  assert.equal(await settlePayout(svc, queued(), 'paid'), false)
  assert.equal(tables.commission_wallet_ledger.length, 2)
  assert.equal(tables.notifications.length, 1)
})

test('failed: marks the row failed, notifies the provider and superadmins', async () => {
  const tables = {
    payout_queue: [queued()],
    transactions: [{ id: 3, payout_status: 'queued' }],
    commission_wallet_ledger: [],
    notifications: [],
    profiles: [{ id: 'admin-1', role: 'superadmin' }],
  }
  const svc = fakeSvc(tables)
  assert.equal(await settlePayout(svc, queued(), 'failed', 'transfer.failed'), true)
  assert.equal(tables.payout_queue[0].status, 'failed')
  assert.match(tables.payout_queue[0].failure_reason, /transfer\.failed/)
  assert.equal(tables.transactions[0].payout_status, 'failed')
  assert.equal(tables.commission_wallet_ledger.length, 0)
  const types = tables.notifications.map((n) => `${n.user_id}:${n.type}`).sort()
  assert.deepEqual(types, ['admin-1:payout_failed_admin', 'prov-1:payout_failed'])
})

test('a reversal after payment marks a paid row failed, so staff see the money is owed back', async () => {
  const tables = {
    payout_queue: [queued({ status: 'paid' })],
    transactions: [{ id: 3, payout_status: 'paid' }],
    commission_wallet_ledger: [],
    notifications: [],
    profiles: [],
  }
  const svc = fakeSvc(tables)
  assert.equal(await settlePayout(svc, queued({ status: 'paid' }), 'failed', 'transfer.reversed'), true)
  assert.equal(tables.payout_queue[0].status, 'failed')
})

test('a row that is no longer processing or paid is left alone on failure', async () => {
  const tables = {
    payout_queue: [queued({ status: 'pending' })],
    transactions: [{ id: 3, payout_status: 'queued' }],
    commission_wallet_ledger: [],
    notifications: [],
    profiles: [],
  }
  const svc = fakeSvc(tables)
  assert.equal(await settlePayout(svc, queued({ status: 'pending' }), 'failed', 'x'), false)
  assert.equal(tables.payout_queue[0].status, 'pending')
  assert.equal(tables.notifications.length, 0)
})

test('paid: the transfer fee is recorded as a gateway cost, and a failure to record it does not stop settlement', async () => {
  const mk = () => ({
    payout_queue: [queued()], transactions: [{ id: 3, payout_status: 'queued' }],
    commission_wallet_ledger: [], notifications: [],
  })
  const t1 = mk(); const svc = fakeSvc(t1); const calls = []
  svc.rpc = async (name, args) => { calls.push({ name, args }); return { data: null, error: null } }
  assert.equal(await settlePayout(svc, queued(), 'paid'), true)
  assert.deepEqual(calls.map((c) => [c.name, c.args.p_kind, c.args.p_reference, c.args.p_base_kobo]), [['record_gateway_cost', 'payout', 'payout:7', 500000]])

  const t2 = mk(); const svc2 = fakeSvc(t2)
  svc2.rpc = async () => ({ data: null, error: { message: 'down' } })
  const orig = console.error; console.error = () => {}
  try { assert.equal(await settlePayout(svc2, queued(), 'paid'), true) } finally { console.error = orig }
  assert.equal(t2.payout_queue[0].status, 'paid')
})
