import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

process.env.ESCROW_WEBHOOK_SECRET = 'test-secret'
const { default: handler } = await import('../../api/escrow-webhook.js')

function call(rawBody, signature) {
  const req = Readable.from([Buffer.from(rawBody)])
  req.method = 'POST'
  req.headers = signature ? { 'x-escrow-signature': signature } : {}
  const out = {}
  const res = { status(c) { out.status = c; return this }, json(b) { out.body = b; return this } }
  return handler(req, res).then(() => out)
}
const sign = (raw) => crypto.createHmac('sha512', 'test-secret').update(raw).digest('hex')

test('escrow webhook: signature over raw bytes is accepted even with odd spacing', async () => {
  const raw = '{ "event" : "unknown.event",  "data": {"reference":"r1"} }'
  const out = await call(raw, sign(raw))
  assert.notEqual(out.status, 400)
  assert.notEqual(out.status, 401)
})
test('escrow webhook: wrong signature rejected', async () => {
  const raw = '{"event":"escrow.funded","data":{"reference":"r1"}}'
  assert.equal((await call(raw, sign(raw + ' '))).status, 400)
})
test('escrow webhook: missing signature rejected', async () => {
  assert.equal((await call('{}', null)).status, 401)
})
test('escrow webhook: short signature does not throw', async () => {
  assert.equal((await call('{}', 'abc')).status, 400)
})
