// Run with: node --test src/lib/transferCheck.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { describeCheck, MESSAGES } from './transferCheck.js'

test('only an HTTP 200 with state paid counts as paid', () => {
  assert.deepEqual(describeCheck(200, { state: 'paid' }), { paid: true, message: '' })
  assert.equal(describeCheck(500, { state: 'paid' }).paid, false)
  assert.equal(describeCheck(200, { paid: true }).paid, false)
  assert.equal(describeCheck(200, null).paid, false)
})

test('each other state shows its own plain message', () => {
  for (const state of ['not_found_yet', 'processing', 'needs_review']) {
    assert.equal(describeCheck(200, { state }).message, MESSAGES[state])
  }
})

test('asking too soon, an unknown state or a failed call never says paid', () => {
  assert.equal(describeCheck(429, { error: 'wait', state: 'too_soon' }).message, MESSAGES.too_soon)
  assert.equal(describeCheck(200, { state: 'weird' }).message, MESSAGES.error)
  assert.equal(describeCheck(502, { error: 'x' }).message, MESSAGES.error)
  assert.equal(describeCheck(401, null).paid, false)
})
