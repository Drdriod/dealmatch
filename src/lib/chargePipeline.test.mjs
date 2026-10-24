// Run with: npm test
//
// The shared path behind the webhook, the "I have paid" button and the background job. Uses the
// in-memory database and a fake gateway, so it pins what the handler-level webhook test cannot:
// finishing an unfinished delivery, counting a charge once, late money on an expired account,
// and what the job and the button do.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './testing/fakeSupabase.mjs'
import {
  creditToEvent, fulfilEvent, processCharge, reconcileVirtualAccounts, verifyOwnPayment,
} from './chargePipeline.js'

const quiet = () => {
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = console.warn = console.error = () => {}
  return () => Object.assign(console, orig)
}

let n = 0
function setup({ status = 'pending', paidKobo = null, extra = {} } = {}) {
  n++
  const ref = 'ref-' + n
  const tables = {
    payment_virtual_accounts: [{
      reference: ref, account_number: 'acct-' + n, expected_kobo: 500000, paid_kobo: paidKobo, status,
      email: 'payer@x.ng', metadata: { type: 'transaction_escrow' }, profile_id: 'r1', created_at: new Date().toISOString(), ...extra,
    }],
    transactions: [{ id: 'job-' + n, payment_ref: ref, provider_id: 'p1', requester_id: 'r1', amount_cents: 500000, status: 'PENDING' }],
    payments: [], payment_refunds: [], notifications: [],
    profiles: [{ id: 'admin-1', role: 'superadmin' }],
  }
  const svc = Object.assign(fakeSupabase(tables), { auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } })
  const charge = (id = 'charge-' + n, naira = 5000) => ({
    id, status: 'succeeded', currency: 'NGN', amount: naira,
    payment_method_details: { bank_transfer: { virtual_account_number: 'acct-' + n } },
  })
  return { ref, tables, svc, charge, row: () => tables.payment_virtual_accounts[0] }
}

// A gateway that knows a fixed set of charges.
const gatewayWith = (charges) => ({
  getCharge: async (id) => charges.find((c) => c.id === id),
  listCharges: async () => ({ data: charges }),
})

test('a handler that failed leaves the account paid but not fulfilled, and the retry finishes it', async () => {
  const restore = quiet()
  try {
    const { svc, tables, charge, row, ref } = setup()
    const c = charge()
    const real = svc.from.bind(svc)
    let fail = true
    svc.from = (t) => (t === 'transactions' && fail ? { ...real(t), select: () => { throw new Error('connection lost') } } : real(t))

    await assert.rejects(processCharge(svc, c), /connection lost/)
    assert.equal(row().status, 'paid')
    assert.ok(!row().fulfilled_at)
    assert.equal(row().fulfilment_claimed_at, null, 'the lease was given back')
    assert.equal(row().fulfilment_error, 'handler_failed', 'a short code, never the error text')

    fail = false
    assert.ok(await processCharge(svc, c), 'the retry reaches the handler')
    assert.ok(row().fulfilled_at)
    assert.equal(tables.transactions[0].status, 'FUNDED', 'the job was funded')
    assert.equal(tables.payment_refunds.filter((r) => r.reason === 'overpaid').length, 0, 'the retry was not treated as a second transfer')
    assert.equal(tables.payments.filter((p) => p.reference === ref).length, 1)
  } finally { restore() }
})

test('a finished delivery repeated changes nothing', async () => {
  const restore = quiet()
  try {
    const { svc, tables, charge } = setup()
    const c = charge()
    assert.ok(await processCharge(svc, c))
    assert.equal(await processCharge(svc, c), null)
    assert.equal(tables.payments.length, 1)
    assert.equal(tables.payment_refunds.length, 0)
  } finally { restore() }
})

test('a different transfer into a paid account is still returned to the payer', async () => {
  const restore = quiet()
  try {
    const { svc, tables, charge } = setup()
    await processCharge(svc, charge('first'))
    assert.equal(await processCharge(svc, charge('second')), null)
    assert.equal(tables.payment_refunds.filter((r) => r.dedupe_key === 'charge:second').length, 1)
  } finally { restore() }
})

test('a short payment counts once however many times its charge is delivered', async () => {
  const restore = quiet()
  try {
    const { svc, charge, row } = setup()
    const part = charge('part', 3000)
    assert.equal(await creditToEvent(svc, part), null)
    assert.equal(await creditToEvent(svc, part), null) // a webhook retry
    assert.equal(row().paid_kobo, 300000, 'not 600000')
    assert.equal(row().status, 'underpaid')
    // The top-up completes it.
    const event = await creditToEvent(svc, charge('top-up', 2000))
    assert.equal(event.data.reference, row().reference)
    assert.equal(row().status, 'paid')
  } finally { restore() }
})

test('full payment that arrives after the account expired is granted, not dropped', async () => {
  const restore = quiet()
  try {
    const { svc, tables, charge, row } = setup({ status: 'expired' })
    assert.ok(await processCharge(svc, charge()))
    assert.equal(row().status, 'paid')
    assert.equal(tables.transactions[0].status, 'FUNDED')
  } finally { restore() }
})

test('late money for a job that can no longer take it goes on the refund list', async () => {
  const restore = quiet()
  try {
    const { svc, tables, charge } = setup({ status: 'expired' })
    tables.transactions[0].status = 'CANCELLED'
    await processCharge(svc, charge())
    assert.equal(tables.payments[0].status, 'unapplied')
    assert.equal(tables.payment_refunds.length, 1)
  } finally { restore() }
})

test('the job finds a credit whose webhook never arrived, and a second run does nothing more', async () => {
  const restore = quiet()
  try {
    const { svc, tables, charge, row } = setup()
    const gateway = gatewayWith([charge('missed')])
    const first = await reconcileVirtualAccounts(svc, { gateway })
    assert.equal(first.scan.applied, 1)
    assert.ok(row().fulfilled_at)
    assert.equal(tables.transactions[0].status, 'FUNDED')
    const second = await reconcileVirtualAccounts(svc, { gateway })
    assert.equal(second.scan.applied, 0)
    assert.equal(tables.payments.length, 1)
  } finally { restore() }
})

test('the job finishes a paid account whose handler failed, once its lease has expired', async () => {
  const restore = quiet()
  try {
    const now = Date.parse('2026-10-22T10:00:00Z')
    const { svc, tables, charge, row } = setup({
      status: 'paid', paidKobo: 500000,
      extra: { completing_charge_id: 'done-1', counted_charge_ids: ['done-1'], paid_at: '2026-10-22T09:00:00Z', fulfilment_claimed_at: new Date(now - 60e3).toISOString() },
    })
    const gateway = gatewayWith([charge('done-1')])
    const live = await reconcileVirtualAccounts(svc, { gateway, now })
    assert.equal(live.busy, 1, 'a live lease is left alone')
    assert.ok(!row().fulfilled_at)

    row().fulfilment_claimed_at = new Date(now - 600e3).toISOString()
    const later = await reconcileVirtualAccounts(svc, { gateway, now })
    assert.equal(later.finished, 1)
    assert.ok(row().fulfilled_at)
    assert.equal(tables.transactions[0].status, 'FUNDED')
  } finally { restore() }
})

test('a paid account with no recorded charge is flagged for review, not guessed at', async () => {
  const restore = quiet()
  try {
    const { svc } = setup({ status: 'paid', paidKobo: 500000, extra: { paid_at: '2026-10-22T09:00:00Z' } })
    const out = await reconcileVirtualAccounts(svc, { gateway: gatewayWith([]) })
    assert.equal(out.needs_review, 1)
  } finally { restore() }
})

test('the charge the gateway returns must belong to the account before anything is granted', async () => {
  const restore = quiet()
  try {
    const { svc, row } = setup({ status: 'paid', paidKobo: 500000, extra: { completing_charge_id: 'x', paid_at: '2026-10-22T09:00:00Z' } })
    const wrong = { id: 'x', status: 'succeeded', currency: 'NGN', amount: 5000, payment_method_details: { bank_transfer: { virtual_account_number: 'someone-else' } } }
    const out = await reconcileVirtualAccounts(svc, { gateway: gatewayWith([wrong]) })
    assert.equal(out.needs_review, 1)
    assert.ok(!row().fulfilled_at)
  } finally { restore() }
})

test('"I have paid": reports paid when the money is there, and not-found-yet when it is not', async () => {
  const restore = quiet()
  try {
    const a = setup()
    assert.deepEqual(await verifyOwnPayment(a.svc, a.row(), { gateway: gatewayWith([]) }), { state: 'not_found_yet' })

    const b = setup()
    assert.deepEqual(await verifyOwnPayment(b.svc, b.row(), { gateway: gatewayWith([b.charge('late')]) }), { state: 'paid' })
    assert.equal(b.tables.transactions[0].status, 'FUNDED')

    // Already finished: no gateway call is needed.
    const noGateway = { getCharge: async () => { throw new Error('must not be called') }, listCharges: async () => { throw new Error('must not be called') } }
    assert.deepEqual(await verifyOwnPayment(b.svc, b.row(), { gateway: noGateway }), { state: 'paid' })
  } finally { restore() }
})

test('"I have paid" only looks at the payer\'s own account, never another open one', async () => {
  const restore = quiet()
  try {
    const mine = setup()
    const other = setup()
    // Merge the two accounts into one database; the gateway holds a credit for the OTHER account only.
    mine.tables.payment_virtual_accounts.push(other.row())
    mine.tables.transactions.push(other.tables.transactions[0])
    const out = await verifyOwnPayment(mine.svc, mine.row(), { gateway: gatewayWith([other.charge('theirs')]) })
    assert.deepEqual(out, { state: 'not_found_yet' })
    assert.equal(mine.tables.transactions[1].status, 'PENDING')
  } finally { restore() }
})

test('fulfilEvent gives the lease back and rethrows when the handler fails', async () => {
  const restore = quiet()
  try {
    const { svc, charge, row } = setup()
    const event = await creditToEvent(svc, charge())
    svc.from = () => { throw new Error('database down') }
    await assert.rejects(fulfilEvent(svc, event), /database down/)
    svc.from = fakeSupabase(svc.tables).from // restore
    assert.equal(row().status, 'paid')
  } finally { restore() }
})
