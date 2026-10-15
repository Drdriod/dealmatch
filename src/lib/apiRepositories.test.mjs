// Run with: node --test src/lib/apiRepositories.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  consumeActiveSession, setSessionStatus, claimSessionAttempt,
} from '../data/agentVerificationRepository.js'
import { listUsers, cleanSearchTerm } from '../data/adminApiRepository.js'
import { findInviterFirstName } from '../data/inviteRepository.js'
import { findRecipientEmail, logOutboundMessage } from '../data/outboundMessageRepository.js'
import { fakeSupabase } from './testing/fakeSupabase.mjs'

// ── Agent verification sessions: each transition happens once ──

test('a session is consumed once: the second consume finds nothing to update', async () => {
  const tables = { verification_sessions: [{ id: 's1', status: 'active', attempts: 0 }] }
  const svc = fakeSupabase(tables)
  const first = await consumeActiveSession(svc, 's1')
  const second = await consumeActiveSession(svc, 's1')
  assert.equal(first.data.length, 1)
  assert.equal(second.data.length, 0)
  assert.equal(tables.verification_sessions[0].status, 'consumed')
})

test('a consumed session is not moved back to rejected', async () => {
  const tables = { verification_sessions: [{ id: 's2', status: 'consumed' }] }
  await setSessionStatus(fakeSupabase(tables), 's2', 'rejected')
  assert.equal(tables.verification_sessions[0].status, 'consumed')
})

test('an attempt is counted once, from the value the caller read', async () => {
  const tables = { verification_sessions: [
    { id: 's3', status: 'active', attempts: 1 },
    { id: 's4', status: 'expired', attempts: 1 },
  ] }
  const svc = fakeSupabase(tables)
  const first = await claimSessionAttempt(svc, 's3', 1)
  const stale = await claimSessionAttempt(svc, 's3', 1) // a second request that read the same value
  const expired = await claimSessionAttempt(svc, 's4', 1)
  assert.equal(first.data.length, 1)
  assert.equal(stale.data.length, 0)
  assert.equal(expired.data.length, 0)
  assert.equal(tables.verification_sessions[0].attempts, 2)
  assert.equal(tables.verification_sessions[1].attempts, 1)
})

// ── Admin user search: user text cannot add filter clauses ──

test('search text has its filter characters removed', () => {
  assert.equal(cleanSearchTerm('ada,role.eq.admin'), 'ada role.eq.admin')
  assert.equal(cleanSearchTerm('  (x)*  '), 'x')
})

test('a search cannot add a clause to the user filter', async () => {
  const seen = []
  const builder = {
    select() { return builder },
    order() { return builder },
    range() { return builder },
    eq() { return builder },
    or(expr) { seen.push(expr); return builder },
    then(resolve) { resolve({ data: [], error: null, count: 0 }) },
  }
  await listUsers({ from: () => builder }, { from: 0, to: 9, search: 'ada,role.eq.admin', role: '', status: '' })
  assert.deepEqual(seen, ['full_name.ilike.%ada role.eq.admin%,email.ilike.%ada role.eq.admin%'])
})

// ── Invite codes: only active members can be invited by ──

test('an invite code validates only for an active member', async () => {
  const tables = { profiles: [
    { id: 'u1', invite_code: 'ABC123', full_name: 'Ada Obi', is_deactivated: false },
    { id: 'u2', invite_code: 'DEF456', full_name: 'Ben Eze', is_deactivated: true },
  ] }
  const anon = fakeSupabase(tables)
  assert.equal((await findInviterFirstName(anon, 'ABC123')).data.full_name, 'Ada Obi')
  assert.equal((await findInviterFirstName(anon, 'DEF456')).data, null)
  assert.equal((await findInviterFirstName(anon, 'NOPE00')).data, null)
})

// ── Outbound messages ──

test('the recipient is looked up by user id and every send is logged', async () => {
  const tables = {
    profiles: [{ id: 'u1', email: 'ada@x.com', full_name: 'Ada Obi' }, { id: 'u2', email: 'ben@x.com' }],
    outbound_message_log: [],
  }
  const svc = fakeSupabase(tables)
  assert.equal((await findRecipientEmail(svc, 'u1')).data.email, 'ada@x.com')
  await logOutboundMessage(svc, { channel: 'email', recipient: 'ada@x.com', status: 'sent' })
  assert.equal(tables.outbound_message_log.length, 1)
  assert.equal(tables.outbound_message_log[0].recipient, 'ada@x.com')
})
