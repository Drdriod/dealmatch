// Run with: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { vatKobo, addVat, currentVatRate } from './vat.js'

test('vatKobo: rounds to the kobo and returns 0 for nothing to tax', () => {
  assert.equal(vatKobo(5000, 7.5), 37500)
  assert.equal(vatKobo(8500, 7.5), 63750)
  assert.equal(vatKobo(333.33, 7.5), 2500)
  assert.equal(vatKobo(5000, 0), 0)
  assert.equal(vatKobo(0, 7.5), 0)
  assert.equal(vatKobo(-10, 7.5), 0)
  assert.equal(vatKobo(NaN, 7.5), 0)
})

test('addVat: VAT goes on the fee only, the price is untouched', () => {
  // A hotel booking: room charge 100,000 + fee 8,000. Only the fee is taxed.
  const plan = { amountNaira: 108000, feeNaira: 8000, metadata: { type: 'hotel_booking' } }
  const r = addVat(plan, 7.5)
  assert.equal(r.priceKobo, 10800000)
  assert.equal(r.vatKobo, 60000)
  assert.equal(r.totalKobo, 10860000)
  assert.equal(r.metadata.vat_kobo, '60000')
  assert.equal(r.metadata.vat_base_kobo, '800000')
  assert.equal(r.metadata.type, 'hotel_booking')
})

test('addVat: with VAT off nothing changes and no tax keys are added', () => {
  const plan = { amountNaira: 25000, feeNaira: 25000, metadata: { type: 'professional_subscription' } }
  const r = addVat(plan, 0)
  assert.equal(r.totalKobo, 2500000)
  assert.equal(r.vatKobo, 0)
  assert.equal('vat_kobo' in r.metadata, false)
})

test('addVat: a job payment carries no VAT at checkout (its commission is taxed at release)', () => {
  const r = addVat({ amountNaira: 100000, feeNaira: 0, metadata: { type: 'transaction_escrow' } }, 7.5)
  assert.equal(r.totalKobo, 10000000)
  assert.equal(r.vatKobo, 0)
})

test('currentVatRate: 0 when off or missing, the rate when on, throws on a read error', async () => {
  const svc = (data, error = null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) })
  assert.equal(await currentVatRate(svc({ rate_pct: 7.5, is_active: true })), 7.5)
  assert.equal(await currentVatRate(svc({ rate_pct: 7.5, is_active: false })), 0)
  assert.equal(await currentVatRate(svc(null)), 0)
  await assert.rejects(currentVatRate(svc(null, new Error('down'))))
})
