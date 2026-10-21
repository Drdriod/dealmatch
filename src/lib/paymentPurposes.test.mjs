// Run with: node --test src/lib/paymentPurposes.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePayment, registerPaymentPurpose, registeredPurposes, PaymentError,
} from './paymentPurposes.js'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

const buyer = { id: 'buyer-1', email: 'b@example.com' }

test('the six built-in purposes are registered', () => {
  assert.deepEqual(registeredPurposes(), [
    'contact_unlock_credits', 'escrow_payment', 'hostel_listing_fee',
    'hotel_booking', 'professional_subscription', 'transaction_escrow',
  ])
})

test('an unknown purpose is refused with a 400', async () => {
  await assert.rejects(
    () => resolvePayment(fakeSupabase(), { purpose: 'mystery', subject: {}, reference: 'r', user: buyer }),
    (err) => err instanceof PaymentError && err.status === 400 && err.message === 'Unknown payment type',
  )
})

test('names inherited from Object.prototype are refused, not run as handlers', async () => {
  for (const purpose of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    await assert.rejects(
      () => resolvePayment(fakeSupabase(), { purpose, subject: {}, reference: 'r', user: buyer }),
      (err) => err instanceof PaymentError && err.status === 400,
      purpose,
    )
  }
})

test('registerPaymentPurpose refuses a handler that is not a function', () => {
  assert.throws(() => registerPaymentPurpose('bad', 'not a function'), TypeError)
})

test('a newly registered purpose is dispatched without changing the dispatcher', async () => {
  let seen = null
  registerPaymentPurpose('test_channel', async (svc, args) => {
    seen = args
    return { amountNaira: 1000, metadata: { type: 'test_channel' } }
  })
  const result = await resolvePayment(fakeSupabase(), {
    purpose: 'test_channel', subject: { x: 1 }, reference: 'ref-9', user: buyer,
  })
  assert.deepEqual(result, { amountNaira: 1000, metadata: { type: 'test_channel' } })
  assert.equal(seen.reference, 'ref-9')
  assert.deepEqual(seen.subject, { x: 1 })
})

test('escrow payment is only granted to the buyer on the reservation', async () => {
  const tables = {
    escrow_transactions: [{
      id: 'esc-1', property_id: 'prop-1', gross_amount: 250000, status: 'awaiting_payment',
      buyer_id: 'buyer-1', payment_ref: 'ref-e',
    }],
  }
  const ok = await resolvePayment(fakeSupabase(tables), {
    purpose: 'escrow_payment', subject: {}, reference: 'ref-e', user: buyer,
  })
  assert.equal(ok.amountNaira, 250000)
  assert.equal(ok.metadata.escrow_id, 'esc-1')

  await assert.rejects(
    () => resolvePayment(fakeSupabase(tables), {
      purpose: 'escrow_payment', subject: {}, reference: 'ref-e', user: { id: 'someone-else' },
    }),
    (err) => err instanceof PaymentError && err.status === 404,
  )
})

test('an escrow reservation that is no longer awaiting payment is refused', async () => {
  const tables = {
    escrow_transactions: [{
      id: 'esc-2', property_id: 'p', gross_amount: 1, status: 'funded', buyer_id: 'buyer-1', payment_ref: 'ref-f',
    }],
  }
  await assert.rejects(
    () => resolvePayment(fakeSupabase(tables), { purpose: 'escrow_payment', subject: {}, reference: 'ref-f', user: buyer }),
    (err) => err instanceof PaymentError && err.status === 409,
  )
})

test('an unlock pack that is not on the list is refused', async () => {
  await assert.rejects(
    () => resolvePayment(fakeSupabase(), {
      purpose: 'contact_unlock_credits', subject: { pack: 'unlock_everything' }, reference: 'r', user: buyer,
    }),
    (err) => err instanceof PaymentError && err.status === 400,
  )
})

test('an unlock pack is priced from the registry and grants its credits', async () => {
  const tables = { platform_fees: [{ key: 'unlock_credit_pack_5', value: 4500, is_active: true }] }
  const result = await resolvePayment(fakeSupabase(tables), {
    purpose: 'contact_unlock_credits', subject: { pack: 'unlock_credit_pack_5' }, reference: 'r', user: buyer,
  })
  assert.equal(result.amountNaira, 4500)
  assert.equal(result.metadata.credits, '5')
})

test('a channel switched off in the registry refuses to charge', async () => {
  const tables = { platform_fees: [{ key: 'unlock_credit_single', value: 1500, is_active: false }] }
  await assert.rejects(
    () => resolvePayment(fakeSupabase(tables), {
      purpose: 'contact_unlock_credits', subject: { pack: 'unlock_credit_single' }, reference: 'r', user: buyer,
    }),
    (err) => err instanceof PaymentError && err.status === 409,
  )
})
