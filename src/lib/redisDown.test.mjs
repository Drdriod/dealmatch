import test from 'node:test'
import assert from 'node:assert/strict'
import { redisRateLimit } from './redis.js'

const req = { headers: { 'x-forwarded-for': '1.2.3.4' } }

test('a fail-closed route says the limiter is unavailable when Redis is not configured', async () => {
  const keep = { u: process.env.UPSTASH_REDIS_REST_URL, t: process.env.UPSTASH_REDIS_REST_TOKEN, n: process.env.NODE_ENV }
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN
  process.env.NODE_ENV = 'production'
  const log = console.error; console.error = () => {}
  try {
    const r = await redisRateLimit(req, 'pay_va', 10, 60, true, { failClosed: true })
    assert.equal(r.allowed, false)
    assert.equal(r.unavailable, true)
  } finally {
    console.error = log
    if (keep.u) process.env.UPSTASH_REDIS_REST_URL = keep.u
    if (keep.t) process.env.UPSTASH_REDIS_REST_TOKEN = keep.t
    process.env.NODE_ENV = keep.n
  }
})

test('sign-in routes still use the memory fallback and are not marked unavailable', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN
  const log = console.error; console.error = () => {}
  try {
    const r = await redisRateLimit(req, 'admin-login-ip', 10, 60, true, { failClosed: true, memoryFallback: true })
    assert.equal(r.allowed, true)
    assert.equal(r.unavailable, undefined)
  } finally { console.error = log }
})
