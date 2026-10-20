// Run with: npm test   (node --experimental-test-module-mocks --test src/lib/*.test.mjs)
//
// Drives the real api/flutterwave-webhook.js handler: a correctly signed request, the real payment
// gateway adapter over a faked Flutterwave client, and the in-memory database. It pins what the
// unit tests of chargePurposes.js cannot see: the status the payments row gets, and what a failure
// does to the "already processed" memory.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

if (typeof mock.module !== 'function') {
  throw new Error('This test needs module mocking. Run it with `npm test`, which passes --experimental-test-module-mocks.')
}

// ── Doubles ──────────────────────────────────────────────────────────────────────────────────
let currentSvc = null
let currentCharge = null
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => currentSvc } })
mock.module('./flutterwaveServer.js', {
  namedExports: {
    // The adapter asks for GET /charges/<id>; answer with whatever the test set up.
    flw: async (method, path) => {
      if (method === 'GET' && path.startsWith('/charges/')) return currentCharge
      throw new Error('unexpected Flutterwave call: ' + method + ' ' + path)
    },
  },
})

Object.assign(process.env, {
  FLUTTERWAVE_SECRET_HASH: 'test-secret-hash',
  FLUTTERWAVE_V4_CLIENT_ID: 'id',
  FLUTTERWAVE_V4_CLIENT_SECRET: 'secret',
  FLUTTERWAVE_BASE_URL: 'http://flutterwave.invalid',
  VITE_SUPABASE_URL: 'http://supabase.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
})
const { default: handler } = await import('../../api/flutterwave-webhook.js')

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────
const quiet = () => {
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = console.warn = console.error = () => {}
  return () => Object.assign(console, orig)
}

let n = 0
// A bank transfer of the right size into a virtual account that is waiting for a marketplace job.
function setup({ jobCents = 500000 } = {}) {
  n++
  const ref = 'ref-' + n
  const tables = {
    payment_virtual_accounts: [{
      reference: ref, account_number: 'acct-' + n, expected_kobo: 500000, paid_kobo: 0, status: 'pending',
      email: 'payer@x.ng', metadata: { type: 'transaction_escrow' },
    }],
    transactions: [{ id: 'job-' + n, payment_ref: ref, provider_id: 'p1', requester_id: 'r1', amount_cents: jobCents, status: 'PENDING' }],
    payments: [], payment_refunds: [], notifications: [],
    profiles: [{ id: 'admin-1', role: 'superadmin' }],
  }
  currentSvc = Object.assign(fakeSupabase(tables), { auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } })
  currentCharge = {
    id: 'charge-' + n, status: 'succeeded', currency: 'NGN', amount: 5000,
    payment_method_details: { bank_transfer: { virtual_account_number: 'acct-' + n } },
  }
  return { ref, tables, chargeId: 'charge-' + n }
}

async function deliver(chargeId) {
  const raw = Buffer.from(JSON.stringify({ type: 'charge.completed', data: { id: chargeId } }))
  const req = Object.assign(Readable.from([raw]), {
    method: 'POST',
    headers: { 'flutterwave-signature': crypto.createHmac('sha256', 'test-secret-hash').update(raw).digest('base64') },
  })
  const out = { code: null, body: null }
  const res = { status(c) { out.code = c; return { json(b) { out.body = b; return out } } } }
  await handler(req, res)
  return out
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────────
test('webhook: a transfer that funds the job is logged as a success', async () => {
  const restore = quiet()
  try {
    const { ref, tables, chargeId } = setup()
    const out = await deliver(chargeId)
    assert.equal(out.code, 200)
    assert.equal(tables.transactions[0].status, 'FUNDED')
    assert.equal(tables.payments.find((p) => p.reference === ref).status, 'success')
    assert.equal(tables.payment_refunds.length, 0)
  } finally { restore() }
})

test('webhook: money that could not fund the job is logged as unapplied and put on the refund list', async () => {
  const restore = quiet()
  try {
    const { ref, tables, chargeId } = setup({ jobCents: 999900 }) // the job costs more than was paid
    const out = await deliver(chargeId)
    assert.equal(out.code, 200)
    assert.equal(tables.transactions[0].status, 'PENDING')
    const row = tables.payments.find((p) => p.reference === ref)
    assert.equal(row.status, 'unapplied')   // admin revenue counts status 'success' only
    assert.equal(row.amount, 5000)
    const refund = tables.payment_refunds.find((r) => r.dedupe_key === 'unapplied:' + ref)
    assert.ok(refund, 'the refund row exists')
    assert.equal(refund.status, 'to_refund')
    assert.equal(refund.amount_kobo, 500000)
  } finally { restore() }
})

test('webhook: a failure answers 500 and releases the reference, so the retry is processed and not skipped', async () => {
  const restore = quiet()
  try {
    const { ref, tables, chargeId } = setup({ jobCents: 999900 })
    const real = currentSvc.from.bind(currentSvc)
    let failRefundWrites = true
    currentSvc.from = (table) => {
      const b = real(table)
      return table === 'payment_refunds' && failRefundWrites
        ? { ...b, upsert: async () => ({ error: { code: '08006', message: 'connection lost' } }) }
        : b
    }
    const first = await deliver(chargeId)
    assert.equal(first.code, 500)
    assert.equal(tables.payments.length, 0)

    // The virtual account was already flipped to paid by the first delivery. A retry only reaches the
    // handler again once that flip is undone (see the open item in docs/architecture/design-patterns.md),
    // so put the row back the way an undo would, and let the writes work.
    Object.assign(tables.payment_virtual_accounts[0], { status: 'pending', paid_kobo: 0 })
    failRefundWrites = false
    const retry = await deliver(chargeId)
    assert.equal(retry.code, 200)
    // Without the release, the retry is answered "Duplicate webhook, skipping" and nothing is recorded.
    assert.equal(tables.payments.find((p) => p.reference === ref)?.status, 'unapplied')
    assert.equal(tables.payment_refunds.filter((r) => r.dedupe_key === 'unapplied:' + ref).length, 1)
  } finally { restore() }
})
