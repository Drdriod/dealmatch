// Run with: npm test
// Admin sign-in must keep working (with a weaker, per-server limit) when the Redis store is missing,
// instead of refusing every attempt. Found by the live-site probe on 12 Nov 2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { redisRateLimit } from './redis.js'

const req = (ip) => ({ headers: { 'x-forwarded-for': ip } })

test('without Redis, a fail-closed route with memoryFallback still lets sign-in through, then limits', async () => {
  const saved = { ...process.env }
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN
  process.env.NODE_ENV = 'production'
  const log = console.error; console.error = () => {}
  try {
    const opts = { failClosed: true, memoryFallback: true }
    for (let i = 0; i < 3; i++) assert.equal((await redisRateLimit(req('1.1.1.1'), 'fb-test', 3, 60, true, opts)).allowed, true)
    assert.equal((await redisRateLimit(req('1.1.1.1'), 'fb-test', 3, 60, true, opts)).allowed, false, 'fourth is refused')
    assert.equal((await redisRateLimit(req('2.2.2.2'), 'fb-test', 3, 60, true, opts)).allowed, true, 'another network is unaffected')
  } finally { console.error = log; process.env = saved }
})

test('without Redis, a fail-closed route WITHOUT the fallback still denies (payments keep their strict rule)', async () => {
  const saved = { ...process.env }
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN
  process.env.NODE_ENV = 'production'
  const log = console.error; console.error = () => {}
  try {
    assert.equal((await redisRateLimit(req('3.3.3.3'), 'strict', 3, 60, true, { failClosed: true })).allowed, false)
  } finally { console.error = log; process.env = saved }
})
