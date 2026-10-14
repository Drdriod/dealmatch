// Run with: node --test src/lib/paymentGateway.test.mjs
// Checks the adapter maps each operation to the right Flutterwave path and
// arguments, using a recording client in place of the real one.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPaymentGateway } from './paymentGateway.js'

function recorder() {
  const calls = []
  const client = async (method, path, opts) => {
    calls.push({ method, path, opts })
    return { ok: true }
  }
  return { client, calls }
}

test('getCharge and getTransfer encode the id into the path', async () => {
  const { client, calls } = recorder()
  const gw = createPaymentGateway(client)
  await gw.getCharge('ch/1 2')
  await gw.getTransfer('tr:9')
  assert.deepEqual(calls[0], { method: 'GET', path: '/charges/ch%2F1%202', opts: undefined })
  assert.deepEqual(calls[1], { method: 'GET', path: '/transfers/tr%3A9', opts: undefined })
})

test('createVirtualAccount forwards body, idempotency key and sandbox headers', async () => {
  const { client, calls } = recorder()
  const gw = createPaymentGateway(client)
  await gw.createVirtualAccount({
    body: { reference: 'r1' },
    idempotencyKey: 'dmvaabc',
    extraHeaders: { 'X-Scenario-Key': 'issuer:approved' },
  })
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].path, '/virtual-accounts')
  assert.deepEqual(calls[0].opts, {
    body: { reference: 'r1' },
    idempotencyKey: 'dmvaabc',
    extraHeaders: { 'X-Scenario-Key': 'issuer:approved' },
  })
})

test('createCustomer sends the email as the body', async () => {
  const { client, calls } = recorder()
  await createPaymentGateway(client).createCustomer({ email: 'a@b.co', idempotencyKey: 'dmcusx' })
  assert.deepEqual(calls[0], {
    method: 'POST', path: '/customers', opts: { body: { email: 'a@b.co' }, idempotencyKey: 'dmcusx' },
  })
})

test('payout operations use the transfer and recipient paths with their keys', async () => {
  const { client, calls } = recorder()
  const gw = createPaymentGateway(client)
  await gw.createRecipient({ body: { type: 'bank_ngn' }, idempotencyKey: 'dmrcp1' })
  await gw.createTransfer({ body: { reference: 'payout-1' }, idempotencyKey: 'dmpayout1' })
  assert.equal(calls[0].path, '/transfers/recipients')
  assert.equal(calls[1].path, '/transfers')
  assert.equal(calls[1].opts.idempotencyKey, 'dmpayout1')
})

test('bank list and account resolution use the Nigerian bank paths', async () => {
  const { client, calls } = recorder()
  const gw = createPaymentGateway(client)
  await gw.listBanks()
  await gw.resolveAccount({ body: { currency: 'NGN' } })
  assert.deepEqual(calls[0], { method: 'GET', path: '/banks?country=NG', opts: undefined })
  assert.equal(calls[1].path, '/banks/account-resolve')
  assert.deepEqual(calls[1].opts, { body: { currency: 'NGN' } })
})
