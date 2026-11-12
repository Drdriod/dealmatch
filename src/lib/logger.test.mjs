// Run with: node --test src/lib/logger.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { log } from './logger.js'

function capture(method, fn) {
  const orig = console[method]; const out = []
  console[method] = (x) => out.push(x)
  try { fn() } finally { console[method] = orig }
  return out
}

test('info writes one JSON line with level, event and fields', () => {
  const [l] = capture('log', () => log.info('escrow.funded', { reference: 'R1', amountNgn: 5000 }))
  assert.deepEqual(JSON.parse(l), { level: 'info', event: 'escrow.funded', reference: 'R1', amountNgn: 5000 })
})
test('warn and error use their own console method', () => {
  assert.equal(JSON.parse(capture('warn', () => log.warn('x.y'))[0]).level, 'warn')
  assert.equal(JSON.parse(capture('error', () => log.error('x.y', { code: 1 }))[0]).code, 1)
})
test('a field that cannot be serialised never throws', () => {
  const circular = {}; circular.self = circular
  const [l] = capture('log', () => log.info('bad', { circular }))
  assert.equal(JSON.parse(l).event, 'bad')
})
