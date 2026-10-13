// Run with: node --test src/lib/payoutSettlement.test.mjs
// Uses an in-memory stand-in for the Supabase client that supports the query
// shapes settlePayout uses: update/insert, eq, in, select, maybeSingle, and await.
import test from 'node:test'
import assert from 'node:assert/strict'
import { settlePayout } from './payoutSettlement.js'

function fakeSvc(tables) {
  const log = { inserts: [] }
  const svc = {
    log,
    from(table) {
      const state = { table, filters: [], op: 'select', patch: null, insertRows: null }
      const builder = {
        select() { return builder },
        update(patch) { state.op = 'update'; state.patch = patch; return builder },
        insert(rows) { state.op = 'insert'; state.insertRows = rows; return builder },
        eq(col, val) { state.filters.push((r) => r[col] === val); return builder },
        in(col, vals) { state.filters.push((r) => vals.includes(r[col])); return builder },
        maybeSingle() { state.single = true; return builder },
        then(resolve, reject) {
          try { resolve(execute(state)) } catch (e) { reject(e) }
        },
      }
      return builder
    },
  }
  function execute(state) {
    const rows = tables[state.table] || (tables[state.table] = [])
    if (state.op === 'insert') {
      const list = Array.isArray(state.insertRows) ? state.insertRows : [state.insertRows]
      rows.push(...list)
      log.inserts.push({ table: state.table, rows: list })
      return { data: list, error: null }
    }
    const matched = rows.filter((r) => state.filters.every((f) => f(r)))
    if (state.op === 'update') {
      matched.forEach((r) => Object.assign(r, state.patch))
      return { data: matched.map((r) => ({ id: r.id })), error: null }
    }
    return { data: state.single ? (matched[0] ?? null) : matched, error: null }
  }
  return svc
}

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
  const changed = await settlePayout(svc, queued(), 'paid')
  assert.equal(changed, true)
  assert.equal(tables.payout_queue[0].status, 'paid')
  assert.equal(tables.transactions[0].payout_status, 'paid')
  const ledger = tables.commission_wallet_ledger.map((r) => r.entry_type)
  assert.deepEqual(ledger, ['released', 'withdrawn'])
  const notes = tables.notifications
  assert.equal(notes.length, 1)
  assert.equal(notes[0].user_id, 'prov-1')
  assert.equal(notes[0].type, 'payout_paid')
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
