// Run with: node --test src/lib/platformRepositories.test.mjs
// These check the filters the cron and API routes rely on. A query that drops one of
// them (for example the attempt limit) changes which money moves or which data is purged.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findPendingPayouts, incrementPayoutAttempts, findStuckProcessingPayouts,
  findVerifiedPayoutAccount, saveRecipientCode, findStuckPayoutAlert,
  findSuperadmins, findTransactionPayoutRef,
} from '../data/payoutQueueRepository.js'
import { findDuePurges, recordPurgeFailure, markPurged } from '../data/identityDocsRepository.js'
import { cancelUnpaidBookings } from '../data/maintenanceRepository.js'
import {
  findVirtualAccountByReference, findCustomerIdForEmail, findPaymentStatus,
} from '../data/paymentVirtualAccountRepository.js'
import { findIdentityStatus, saveIdentityHash } from '../data/accountRepository.js'
import { findListingLatLng } from '../data/listingRepository.js'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

const ids = (rows) => rows.map((r) => r.id)

// ── Payout queue ──

test('pending payouts: only pending rows under the attempt limit, oldest first', async () => {
  const tables = { payout_queue: [
    { id: 'a', status: 'pending', attempts: 0, created_at: '2026-10-02T00:00:00Z' },
    { id: 'b', status: 'pending', attempts: 5, created_at: '2026-10-01T00:00:00Z' },
    { id: 'c', status: 'processing', attempts: 0, created_at: '2026-10-01T00:00:00Z' },
    { id: 'd', status: 'pending', attempts: 1, created_at: '2026-10-01T00:00:00Z' },
  ] }
  const { data } = await findPendingPayouts(fakeSupabase(tables))
  assert.deepEqual(ids(data), ['d', 'a'])
})

test('pending payouts: at most 20 per run', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: `p${i}`, status: 'pending', attempts: 0, created_at: `2026-10-01T00:00:${String(i).padStart(2, '0')}Z`,
  }))
  const { data } = await findPendingPayouts(fakeSupabase({ payout_queue: rows }))
  assert.equal(data.length, 20)
  assert.equal(data[0].id, 'p0')
})

test('incrementing attempts changes only that row', async () => {
  const tables = { payout_queue: [{ id: 1, attempts: 2 }, { id: 2, attempts: 2 }] }
  await incrementPayoutAttempts(fakeSupabase(tables), { id: 1, attempts: 2 })
  assert.equal(tables.payout_queue[0].attempts, 3)
  assert.equal(tables.payout_queue[1].attempts, 2)
})

test('stuck payouts: processing rows created before the cutoff only', async () => {
  const tables = { payout_queue: [
    { id: 'old', status: 'processing', created_at: '2026-10-10T00:00:00Z' },
    { id: 'new', status: 'processing', created_at: '2026-10-15T09:00:00Z' },
    { id: 'done', status: 'paid', created_at: '2026-10-01T00:00:00Z' },
  ] }
  const { data } = await findStuckProcessingPayouts(fakeSupabase(tables), '2026-10-15T07:00:00Z')
  assert.deepEqual(ids(data), ['old'])
})

test('a payout account is returned only when it is verified', async () => {
  const tables = { payout_accounts: [
    { id: 'acc1', status: 'verified' },
    { id: 'acc2', status: 'pending' },
  ] }
  const svc = fakeSupabase(tables)
  assert.equal((await findVerifiedPayoutAccount(svc, 'acc1')).data.id, 'acc1')
  assert.equal((await findVerifiedPayoutAccount(svc, 'acc2')).data, null)
})

test('saving the recipient code writes only to the given account', async () => {
  const tables = { payout_accounts: [
    { id: 'acc1', gateway_recipient_code: null },
    { id: 'acc2', gateway_recipient_code: null },
  ] }
  await saveRecipientCode(fakeSupabase(tables), 'acc1', 'RCP_1')
  assert.equal(tables.payout_accounts[0].gateway_recipient_code, 'RCP_1')
  assert.equal(tables.payout_accounts[1].gateway_recipient_code, null)
})

test('stuck-payout alert: payout #12 does not match an alert for payout #120', async () => {
  const tables = { notifications: [{ id: 1, type: 'payout_stuck', message: 'Payout #120 is stuck' }] }
  const svc = fakeSupabase(tables)
  assert.equal((await findStuckPayoutAlert(svc, 12)).data.length, 0)
  tables.notifications.push({ id: 2, type: 'payout_stuck', message: 'Payout #12 is stuck' })
  assert.equal((await findStuckPayoutAlert(svc, 12)).data.length, 1)
})

test('superadmin lookup returns only superadmin profiles', async () => {
  const tables = { profiles: [{ id: 'a', role: 'superadmin' }, { id: 'b', role: 'provider' }] }
  const { data } = await findSuperadmins(fakeSupabase(tables))
  assert.deepEqual(ids(data), ['a'])
})

test('transaction payout ref is read for the given transaction', async () => {
  const tables = { transactions: [{ id: 't1', payout_ref: 'TRF_9' }, { id: 't2', payout_ref: null }] }
  assert.equal((await findTransactionPayoutRef(fakeSupabase(tables), 't1')).data.payout_ref, 'TRF_9')
})

// ── Identity document purge ──

test('purge queue: only rows that are due, not purged, and under the attempt limit', async () => {
  const tables = { identity_doc_purge_queue: [
    { id: 'due', purged_at: null, purge_after: '2026-10-01T00:00:00Z', attempts: 0 },
    { id: 'purged', purged_at: '2026-10-02T00:00:00Z', purge_after: '2026-10-01T00:00:00Z', attempts: 0 },
    { id: 'later', purged_at: null, purge_after: '2026-11-01T00:00:00Z', attempts: 0 },
    { id: 'gaveup', purged_at: null, purge_after: '2026-10-01T00:00:00Z', attempts: 5 },
  ] }
  const { data } = await findDuePurges(fakeSupabase(tables), '2026-10-15T00:00:00Z')
  assert.deepEqual(ids(data), ['due'])
})

test('a failed purge counts one attempt and keeps at most 500 characters of the reason', async () => {
  const tables = { identity_doc_purge_queue: [{ id: 1, attempts: 2, last_error: null }] }
  await recordPurgeFailure(fakeSupabase(tables), { id: 1, attempts: 2 }, 'x'.repeat(800))
  assert.equal(tables.identity_doc_purge_queue[0].attempts, 3)
  assert.equal(tables.identity_doc_purge_queue[0].last_error.length, 500)
})

test('marking purged clears the storage path for the given rows only', async () => {
  const tables = { identity_doc_purge_queue: [
    { id: 1, storage_path: 'a/1.jpg', purged_at: null },
    { id: 2, storage_path: 'a/2.jpg', purged_at: null },
  ] }
  await markPurged(fakeSupabase(tables), [1], '2026-10-15T00:00:00Z')
  assert.equal(tables.identity_doc_purge_queue[0].purged_at, '2026-10-15T00:00:00Z')
  assert.equal(tables.identity_doc_purge_queue[0].storage_path, null)
  assert.equal(tables.identity_doc_purge_queue[1].purged_at, null)
  assert.equal(tables.identity_doc_purge_queue[1].storage_path, 'a/2.jpg')
})

// ── Maintenance ──

test('unpaid hotel bookings: only pending bookings created before the cutoff are cancelled', async () => {
  const tables = { bookings: [
    { id: 'old-pending', status: 'pending', created_at: '2026-10-10T00:00:00Z' },
    { id: 'new-pending', status: 'pending', created_at: '2026-10-15T00:00:00Z' },
    { id: 'old-paid', status: 'confirmed', created_at: '2026-10-10T00:00:00Z' },
  ] }
  const { data } = await cancelUnpaidBookings(fakeSupabase(tables), '2026-10-13T00:00:00Z')
  assert.deepEqual(ids(data), ['old-pending'])
  assert.equal(tables.bookings[0].status, 'cancelled')
  assert.equal(tables.bookings[1].status, 'pending')
  assert.equal(tables.bookings[2].status, 'confirmed')
})

// ── Virtual accounts ──

test('a virtual account is found by its reference', async () => {
  const tables = { payment_virtual_accounts: [
    { reference: 'REF-AAA111', profile_id: 'u1' },
    { reference: 'REF-BBB222', profile_id: 'u2' },
  ] }
  assert.equal((await findVirtualAccountByReference(fakeSupabase(tables), 'REF-BBB222')).data.profile_id, 'u2')
})

test('the customer reused for an email is the newest one, ignoring rows with no customer', async () => {
  const tables = { payment_virtual_accounts: [
    { reference: 'r1', email: 'a@x.com', customer_id: 'cus_old', created_at: '2026-09-01T00:00:00Z' },
    { reference: 'r2', email: 'a@x.com', customer_id: 'cus_new', created_at: '2026-10-01T00:00:00Z' },
    { reference: 'r3', email: 'a@x.com', customer_id: null, created_at: '2026-10-05T00:00:00Z' },
    { reference: 'r4', email: 'b@x.com', customer_id: 'cus_other', created_at: '2026-10-06T00:00:00Z' },
  ] }
  const { data } = await findCustomerIdForEmail(fakeSupabase(tables), 'a@x.com')
  assert.equal(data.customer_id, 'cus_new')
})

test('the payer status poll reads the row it is given', async () => {
  const tables = { payment_virtual_accounts: [{ reference: 'REF-CCC333', status: 'paid', profile_id: 'u1' }] }
  const { data } = await findPaymentStatus(fakeSupabase(tables), 'REF-CCC333')
  assert.equal(data.status, 'paid')
})

// ── Accounts and identity ──

test('identity status and hash save touch only the given profile', async () => {
  const tables = { profiles: [
    { id: 'u1', identity_verification_status: 'pending', identity_hmac: null },
    { id: 'u2', identity_verification_status: 'approved', identity_hmac: null },
  ] }
  const svc = fakeSupabase(tables)
  assert.equal((await findIdentityStatus(svc, 'u2')).data.identity_verification_status, 'approved')
  await saveIdentityHash(svc, 'u1', 'hash-abc', '2026-10-15T00:00:00Z')
  assert.equal(tables.profiles[0].identity_hmac, 'hash-abc')
  assert.equal(tables.profiles[0].identity_nin_submitted_at, '2026-10-15T00:00:00Z')
  assert.equal(tables.profiles[1].identity_hmac, null)
})

// ── Listings ──

test('listing lat/lng calls the RPC with the listing id', async () => {
  const calls = []
  const client = {
    rpc(name, args) {
      calls.push({ name, args })
      return { single: async () => ({ data: { lat: -6.5, lng: 3.4 }, error: null }) }
    },
  }
  const { data } = await findListingLatLng(client, 'L1')
  assert.deepEqual(calls, [{ name: 'get_listing_with_latlng', args: { p_id: 'L1' } }])
  assert.equal(data.lat, -6.5)
})
