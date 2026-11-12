// Run with: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { idleState, STAFF_IDLE_LIMIT_MS } from './idleTimeout.js'

const MIN = 60 * 1000

test('recent activity is active', () => {
  assert.equal(idleState(0, 5 * MIN).state, 'active')
})
test('the last minute before the limit is a warning with a countdown', () => {
  const r = idleState(0, STAFF_IDLE_LIMIT_MS - 30 * 1000)
  assert.equal(r.state, 'warning')
  assert.equal(r.secondsLeft, 30)
})
test('at and past the limit the session has expired', () => {
  assert.equal(idleState(0, STAFF_IDLE_LIMIT_MS).state, 'expired')
  assert.equal(idleState(0, STAFF_IDLE_LIMIT_MS + 5 * MIN).state, 'expired')
})
test('a laptop that slept past the limit expires on the first check after waking', () => {
  assert.equal(idleState(1000, 1000 + 3 * 60 * MIN).state, 'expired')
})
