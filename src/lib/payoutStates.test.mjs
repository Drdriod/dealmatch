// Run with: node --test src/lib/payoutStates.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PAYOUT_TRANSITIONS, canTransition, sourcesFor, movePayout, IllegalPayoutTransition,
} from './payoutStates.js'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

test('the allowed moves are exactly the table', () => {
  assert.equal(canTransition('pending', 'processing'), true)
  assert.equal(canTransition('processing', 'paid'), true)
  assert.equal(canTransition('paid', 'failed'), true)
  assert.equal(canTransition('failed', 'pending'), true) // admin retry
  assert.equal(canTransition('paid', 'pending'), false)
  assert.equal(canTransition('failed', 'paid'), false)
  assert.equal(canTransition('pending', 'paid'), false)
  assert.equal(canTransition('unknown', 'paid'), false)
})

test('sourcesFor lists every state that may move to a target', () => {
  assert.deepEqual(sourcesFor('paid'), ['processing'])
  assert.deepEqual(sourcesFor('processing'), ['pending'])
  assert.deepEqual(sourcesFor('failed').sort(), ['paid', 'pending', 'processing'])
})

test('every target state is reachable from the table', () => {
  const targets = new Set(Object.values(PAYOUT_TRANSITIONS).flat())
  for (const t of targets) assert.ok(sourcesFor(t).length > 0, `${t} has no source`)
})

test('an illegal move is refused before anything is written', async () => {
  const tables = { payout_queue: [{ id: 1, status: 'paid' }] }
  const svc = fakeSupabase(tables)
  await assert.rejects(
    () => movePayout(svc, 1, 'pending', {}, { from: ['paid'] }),
    IllegalPayoutTransition,
  )
  assert.equal(tables.payout_queue[0].status, 'paid')
})

test('movePayout changes the row once and reports whether it did', async () => {
  const tables = { payout_queue: [{ id: 5, status: 'pending' }] }
  const svc = fakeSupabase(tables)
  assert.equal(await movePayout(svc, 5, 'processing', { gateway_ref: 'payout-5' }, { from: ['pending'] }), true)
  assert.equal(tables.payout_queue[0].status, 'processing')
  assert.equal(tables.payout_queue[0].gateway_ref, 'payout-5')
  // The same move again finds the row no longer pending, so nothing changes.
  assert.equal(await movePayout(svc, 5, 'processing', {}, { from: ['pending'] }), false)
})

test('a stale decision does not overwrite a row that moved on', async () => {
  const tables = { payout_queue: [{ id: 2, status: 'paid' }] }
  const svc = fakeSupabase(tables)
  // The caller believes the row is processing, but it has already been paid.
  assert.equal(await movePayout(svc, 2, 'failed', { failure_reason: 'late' }, { from: ['processing'] }), false)
  assert.equal(tables.payout_queue[0].status, 'paid')
  assert.equal(tables.payout_queue[0].failure_reason, undefined)
})

test('without an explicit source, movePayout uses every legal source', async () => {
  const tables = { payout_queue: [{ id: 3, status: 'processing' }] }
  const svc = fakeSupabase(tables)
  assert.equal(await movePayout(svc, 3, 'paid', { processed_at: 'now' }), true)
  assert.equal(tables.payout_queue[0].status, 'paid')
})
