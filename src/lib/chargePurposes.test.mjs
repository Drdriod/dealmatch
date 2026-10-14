// Run with: node --test src/lib/chargePurposes.test.mjs
// Pins the behaviour of each confirmed-charge purpose before and after the
// split out of api/flutterwave-webhook.js. Uses the in-memory Supabase fake.
import test from 'node:test'
import assert from 'node:assert/strict'
import { runChargePurpose, recordMoneyToReturn, CHARGE_PURPOSES } from './chargePurposes.js'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

const quiet = () => {
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = console.warn = console.error = () => {}
  return () => Object.assign(console, orig)
}

// A fake client with an auth admin lookup, since the unlock purpose needs one.
function svcWith(tables, users = {}) {
  const svc = fakeSupabase(tables)
  svc.auth = { admin: { getUserById: async (id) => ({ data: { user: users[id] || null } }) } }
  return svc
}

const charge = (metadata, over = {}) => ({
  reference: 'ref-1', amount: 500000, customer: { email: 'payer@x.ng' }, metadata, ...over,
})

test('no purpose, or a purpose not in the registry, changes nothing', async () => {
  const restore = quiet()
  try {
    const tables = { payments: [] }
    assert.deepEqual(await runChargePurpose(svcWith(tables), charge({})), {})
    assert.deepEqual(await runChargePurpose(svcWith(tables), charge({ type: 'nope' })), {})
    // Inherited names must not reach Object.prototype.
    assert.deepEqual(await runChargePurpose(svcWith(tables), charge({ type: 'constructor' })), {})
    assert.deepEqual(await runChargePurpose(svcWith(tables), charge({ type: '__proto__' })), {})
    assert.equal(Object.keys(tables).length, 1)
  } finally { restore() }
})

test('registry covers exactly the six purposes', () => {
  assert.deepEqual(Object.keys(CHARGE_PURPOSES).sort(), [
    'contact_unlock_credits', 'escrow_payment', 'hostel_listing_fee',
    'hotel_booking', 'professional_subscription', 'transaction_escrow',
  ])
})

test('professional: approved identity activates the application, matched by application_id', async () => {
  const restore = quiet()
  try {
    const tables = {
      profiles: [{ id: 'u1', identity_verification_status: 'approved' }],
      professional_applications: [{ id: 'app-1', email: 'payer@x.ng', status: 'pending' }],
    }
    await runChargePurpose(svcWith(tables), charge({
      type: 'professional_subscription', user_id: 'u1', application_id: 'app-1', plan_type: 'annual',
    }))
    const app = tables.professional_applications[0]
    assert.equal(app.status, 'approved')
    assert.ok(app.activated_at)
    assert.ok(app.subscription_expiry)
  } finally { restore() }
})

test('professional: unverified identity stays pending until the trigger approves later', async () => {
  const restore = quiet()
  try {
    const tables = {
      profiles: [{ id: 'u1', identity_verification_status: 'pending' }],
      professional_applications: [{ id: 'app-1', email: 'payer@x.ng', status: 'pending' }],
    }
    await runChargePurpose(svcWith(tables), charge({ type: 'professional_subscription', user_id: 'u1', application_id: 'app-1' }))
    assert.equal(tables.professional_applications[0].status, 'pending')
    assert.equal(tables.professional_applications[0].activated_at, null)
  } finally { restore() }
})

test('professional: without application_id, matches the payer email (legacy payments)', async () => {
  const restore = quiet()
  try {
    const tables = {
      professional_applications: [
        { id: 'a', email: 'payer@x.ng', status: 'pending' },
        { id: 'b', email: 'other@x.ng', status: 'pending' },
      ],
    }
    await runChargePurpose(svcWith(tables), charge({ type: 'professional_subscription', plan_type: 'monthly' }))
    assert.equal(tables.professional_applications[0].subscription_plan, 'monthly')
    assert.equal(tables.professional_applications[1].subscription_plan, undefined)
  } finally { restore() }
})

test('hotel: a pending booking is confirmed; a repeat webhook does not touch it', async () => {
  const restore = quiet()
  try {
    const tables = { bookings: [{ id: 'b1', status: 'pending', payment_ref: 'ref-1' }], payment_refunds: [], profiles: [] }
    await runChargePurpose(svcWith(tables), charge({ type: 'hotel_booking', booking_id: 'b1' }))
    assert.equal(tables.bookings[0].status, 'confirmed')
    assert.equal(tables.payment_refunds.length, 0)
    // Repeat: already confirmed, not cancelled, so no refund and no change.
    await runChargePurpose(svcWith(tables), charge({ type: 'hotel_booking', booking_id: 'b1' }))
    assert.equal(tables.bookings[0].status, 'confirmed')
    assert.equal(tables.payment_refunds.length, 0)
  } finally { restore() }
})

test('hotel: paid after the booking was released goes on the refund list, once', async () => {
  const restore = quiet()
  try {
    const tables = {
      bookings: [{ id: 'b1', status: 'cancelled', payment_ref: null }],
      payment_refunds: [], profiles: [{ id: 'admin-1', role: 'superadmin' }], notifications: [],
    }
    const meta = { type: 'hotel_booking', booking_id: 'b1', user_id: 'guest-1' }
    await runChargePurpose(svcWith(tables), charge(meta, { amount: 750000 }))
    await runChargePurpose(svcWith(tables), charge(meta, { amount: 750000 }))
    assert.equal(tables.payment_refunds.length, 1)
    assert.equal(tables.payment_refunds[0].dedupe_key, 'booking-released:ref-1')
    assert.equal(tables.payment_refunds[0].reason, 'overpaid')
    assert.equal(tables.payment_refunds[0].amount_kobo, 750000)
  } finally { restore() }
})

test('hostel: a matching amount unlocks the listing once', async () => {
  const restore = quiet()
  try {
    const tables = {
      hostel_payments: [{ id: 'hp1', hostel_id: 'h1', amount: 5000, status: 'pending', reference: 'ref-1' }],
      student_hostels: [{ id: 'h1', listing_paid: false }],
    }
    await runChargePurpose(svcWith(tables), charge({ type: 'hostel_listing_fee' }, { amount: 500000 }))
    assert.equal(tables.hostel_payments[0].status, 'success')
    assert.equal(tables.student_hostels[0].listing_paid, true)
    assert.equal(tables.student_hostels[0].payment_ref, 'ref-1')
  } finally { restore() }
})

test('hostel: an amount mismatch is marked failed and never unlocks', async () => {
  const restore = quiet()
  try {
    const tables = {
      hostel_payments: [{ id: 'hp1', hostel_id: 'h1', amount: 9000, status: 'pending', reference: 'ref-1' }],
      student_hostels: [{ id: 'h1', listing_paid: false }],
    }
    await runChargePurpose(svcWith(tables), charge({ type: 'hostel_listing_fee' }, { amount: 500000 }))
    assert.equal(tables.hostel_payments[0].status, 'failed')
    assert.equal(tables.student_hostels[0].listing_paid, false)
  } finally { restore() }
})

test('unlock credits: granted to the verified buyer, once per reference', async () => {
  const restore = quiet()
  try {
    const tables = { unlock_credit_ledger: [] }
    const users = { 'buyer-1': { id: 'buyer-1', email: 'Payer@x.ng' } }
    const meta = { type: 'contact_unlock_credits', user_id: 'buyer-1', credits: 5 }
    await runChargePurpose(svcWith(tables, users), charge(meta, { amount: 5000 }))
    await runChargePurpose(svcWith(tables, users), charge(meta, { amount: 5000 }))
    assert.equal(tables.unlock_credit_ledger.length, 1)
    assert.equal(tables.unlock_credit_ledger[0].profile_id, 'buyer-1')
    assert.equal(tables.unlock_credit_ledger[0].credits, 5)
  } finally { restore() }
})

test('unlock credits: a payer whose email does not match the buyer is not granted', async () => {
  const restore = quiet()
  try {
    const tables = { unlock_credit_ledger: [] }
    const users = { 'buyer-1': { id: 'buyer-1', email: 'someone-else@x.ng' } }
    await runChargePurpose(svcWith(tables, users), charge({ type: 'contact_unlock_credits', user_id: 'buyer-1', credits: 1 }))
    assert.equal(tables.unlock_credit_ledger.length, 0)
  } finally { restore() }
})

test('unlock credits: a credit count outside the price list grants nothing', async () => {
  const restore = quiet()
  try {
    const tables = { unlock_credit_ledger: [] }
    const users = { 'buyer-1': { id: 'buyer-1', email: 'payer@x.ng' } }
    await runChargePurpose(svcWith(tables, users), charge({ type: 'contact_unlock_credits', user_id: 'buyer-1', credits: 999 }))
    assert.equal(tables.unlock_credit_ledger.length, 0)
  } finally { restore() }
})

test('escrow: an awaiting_payment row is funded and returned for the referral step', async () => {
  const restore = quiet()
  try {
    const tables = { escrow_transactions: [{ id: 'e1', payment_ref: 'ref-1', tenant_id: 't1', platform_amount: 15000, gross_amount: 500000, status: 'awaiting_payment', confirmed_at: null }] }
    const out = await runChargePurpose(svcWith(tables), charge({ type: 'escrow_payment' }))
    assert.equal(tables.escrow_transactions[0].status, 'funded')
    assert.equal(tables.escrow_transactions[0].confirmed_at, null) // move-in signal must not be set here
    assert.equal(out.escrowRow.tenant_id, 't1')
    assert.equal(out.escrowRow.platform_amount, 15000)
  } finally { restore() }
})

test('escrow: a released row is never moved back to funded', async () => {
  const restore = quiet()
  try {
    const tables = { escrow_transactions: [{ id: 'e1', payment_ref: 'ref-1', tenant_id: 't1', platform_amount: 1, status: 'released' }] }
    await runChargePurpose(svcWith(tables), charge({ type: 'escrow_payment' }))
    assert.equal(tables.escrow_transactions[0].status, 'released')
  } finally { restore() }
})

test('escrow: no matching payment_ref means no escrow row for referrals', async () => {
  const restore = quiet()
  try {
    const out = await runChargePurpose(svcWith({ escrow_transactions: [] }), charge({ type: 'escrow_payment' }))
    assert.equal(out.escrowRow, null)
  } finally { restore() }
})

test('transaction escrow: a PENDING job with the right amount is funded and the provider notified once', async () => {
  const restore = quiet()
  try {
    const tables = {
      transactions: [{ id: 'j1', payment_ref: 'ref-1', provider_id: 'p1', requester_id: 'r1', amount_cents: 500000, status: 'PENDING' }],
      notifications: [],
    }
    const meta = { type: 'transaction_escrow' }
    const first = await runChargePurpose(svcWith(tables), charge(meta))
    assert.equal(tables.transactions[0].status, 'FUNDED')
    assert.deepEqual(first, {})
    await runChargePurpose(svcWith(tables), charge(meta)) // repeat: no longer PENDING
    assert.equal(tables.notifications.length, 1)
    assert.equal(tables.notifications[0].user_id, 'p1')
  } finally { restore() }
})

test('transaction escrow: an amount mismatch leaves the job PENDING and does not stop the payments log', async () => {
  const restore = quiet()
  try {
    const tables = { transactions: [{ id: 'j1', payment_ref: 'ref-1', provider_id: 'p1', amount_cents: 999900, status: 'PENDING' }] }
    const out = await runChargePurpose(svcWith(tables), charge({ type: 'transaction_escrow' }))
    assert.equal(tables.transactions[0].status, 'PENDING')
    assert.equal(out.stop, undefined) // kept as before: the payments row is still written
  } finally { restore() }
})

test('money to return: an underpaid top-up grows the open row and never reopens a returned one', async () => {
  const restore = quiet()
  try {
    const tables = { payment_refunds: [], profiles: [] }
    const svc = svcWith(tables)
    const row = { reference: 'va-1', email: 'payer@x.ng' }
    await recordMoneyToReturn(svc, row, 1000, 'underpaid', 'part', 'short:va-1')
    await recordMoneyToReturn(svc, row, 2500, 'underpaid', 'part', 'short:va-1')
    assert.equal(tables.payment_refunds.length, 1)
    assert.equal(tables.payment_refunds[0].amount_kobo, 2500)
    tables.payment_refunds[0].status = 'returned'
    await recordMoneyToReturn(svc, row, 9000, 'underpaid', 'part', 'short:va-1')
    assert.equal(tables.payment_refunds[0].status, 'returned')
    assert.equal(tables.payment_refunds[0].amount_kobo, 2500)
  } finally { restore() }
})

test('money to return: an overpayment is recorded once per charge and the super admins are told', async () => {
  const restore = quiet()
  try {
    const tables = {
      payment_refunds: [],
      profiles: [{ id: 'admin-1', role: 'superadmin' }, { id: 'admin-2', role: 'superadmin' }],
      notifications: [],
    }
    const svc = svcWith(tables)
    const row = { reference: 'va-1', email: 'payer@x.ng', profile_id: 'payer-1' }
    await recordMoneyToReturn(svc, row, 700, 'overpaid', 'extra', 'charge:c1')
    await recordMoneyToReturn(svc, row, 700, 'overpaid', 'extra', 'charge:c1')
    assert.equal(tables.payment_refunds.length, 1)
    const kinds = tables.notifications.map((n) => n.type).sort()
    assert.ok(kinds.includes('refund_due'))
    assert.equal(tables.notifications.filter((n) => n.type === 'refund_due').length, 4) // 2 admins x 2 calls
  } finally { restore() }
})
