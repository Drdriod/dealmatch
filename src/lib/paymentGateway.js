// Adapter (structural pattern). The one place that knows Flutterwave's paths and
// request shapes. Payment start, the webhooks and payouts call these named
// operations and never build a URL themselves, so a gateway change, or a test
// double, touches this file only.
//
// Server only. Pass a different client to createPaymentGateway() in tests.
import { flw as defaultClient } from './flutterwaveServer.js'

export function createPaymentGateway(client = defaultClient) {
  return {
    createCustomer: ({ email, idempotencyKey }) =>
      client('POST', '/customers', { body: { email }, idempotencyKey }),

    createVirtualAccount: ({ body, idempotencyKey, extraHeaders }) =>
      client('POST', '/virtual-accounts', { body, idempotencyKey, extraHeaders }),

    getCharge: (id) =>
      client('GET', `/charges/${encodeURIComponent(id)}`),

    getTransfer: (id) =>
      client('GET', `/transfers/${encodeURIComponent(id)}`),

    createRecipient: ({ body, idempotencyKey }) =>
      client('POST', '/transfers/recipients', { body, idempotencyKey }),

    createTransfer: ({ body, idempotencyKey }) =>
      client('POST', '/transfers', { body, idempotencyKey }),

    listBanks: () =>
      client('GET', '/banks?country=NG'),

    resolveAccount: ({ body }) =>
      client('POST', '/banks/account-resolve', { body }),
  }
}

export const paymentGateway = createPaymentGateway()
