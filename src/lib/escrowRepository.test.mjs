// Run with: node --test src/lib/escrowRepository.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  markEscrowFunded, markEscrowReleased, markEscrowRefunded,
} from '../data/escrowRepository.js'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

const NOW = '2026-10-15T10:00:00.000Z'

test('funded moves an awaiting_payment escrow to funded and stamps funded_at', async () => {
  const tables = { escrow_transactions: [{ id: 1, payment_ref: 'ESC-1', status: 'awaiting_payment' }] }
  const { error } = await markEscrowFunded(fakeSupabase(tables), 'ESC-1', NOW)
  assert.equal(error, null)
  assert.equal(tables.escrow_transactions[0].status, 'funded')
  assert.equal(tables.escrow_transactions[0].funded_at, NOW)
})

test('funded does not move a released escrow back to funded', async () => {
  const tables = {
    escrow_transactions: [{ id: 1, payment_ref: 'ESC-2', status: 'released', released_at: '2026-10-01T00:00:00.000Z' }],
  }
  await markEscrowFunded(fakeSupabase(tables), 'ESC-2', NOW)
  assert.equal(tables.escrow_transactions[0].status, 'released')
  assert.equal(tables.escrow_transactions[0].funded_at, undefined)
})

test('funded is a no-op for an already funded escrow (duplicate delivery)', async () => {
  const tables = {
    escrow_transactions: [{ id: 1, payment_ref: 'ESC-3', status: 'funded', funded_at: '2026-10-02T00:00:00.000Z' }],
  }
  await markEscrowFunded(fakeSupabase(tables), 'ESC-3', NOW)
  assert.equal(tables.escrow_transactions[0].funded_at, '2026-10-02T00:00:00.000Z')
})

test('funded for an unknown reference changes nothing and reports no error', async () => {
  const tables = { escrow_transactions: [{ id: 1, payment_ref: 'ESC-4', status: 'awaiting_payment' }] }
  const { error } = await markEscrowFunded(fakeSupabase(tables), 'NOPE', NOW)
  assert.equal(error, null)
  assert.equal(tables.escrow_transactions[0].status, 'awaiting_payment')
})

test('released sets status and released_at for the matching escrow only', async () => {
  const tables = {
    escrow_transactions: [
      { id: 1, payment_ref: 'ESC-5', status: 'funded' },
      { id: 2, payment_ref: 'ESC-6', status: 'funded' },
    ],
  }
  await markEscrowReleased(fakeSupabase(tables), 'ESC-5', NOW)
  assert.equal(tables.escrow_transactions[0].status, 'released')
  assert.equal(tables.escrow_transactions[0].released_at, NOW)
  assert.equal(tables.escrow_transactions[1].status, 'funded')
})

test('refunded sets status refunded for the matching escrow', async () => {
  const tables = { escrow_transactions: [{ id: 1, payment_ref: 'ESC-7', status: 'funded' }] }
  await markEscrowRefunded(fakeSupabase(tables), 'ESC-7')
  assert.equal(tables.escrow_transactions[0].status, 'refunded')
})

// The handler throws on a returned error so the sender retries. These tests check
// that the repository hands the client's error back instead of swallowing it.
function failingSupabase(message) {
  const builder = {
    update() { return builder },
    eq() { return builder },
    then(resolve) { resolve({ data: null, error: { message } }) },
  }
  return { from: () => builder }
}

test('funded returns the client error so the handler can fail the request', async () => {
  const { error } = await markEscrowFunded(failingSupabase('db down'), 'ESC-8', NOW)
  assert.equal(error.message, 'db down')
})

test('released returns the client error', async () => {
  const { error } = await markEscrowReleased(failingSupabase('db down'), 'ESC-9', NOW)
  assert.equal(error.message, 'db down')
})

test('refunded returns the client error', async () => {
  const { error } = await markEscrowRefunded(failingSupabase('db down'), 'ESC-10')
  assert.equal(error.message, 'db down')
})
