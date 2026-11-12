// Run with: npm test
// Who may message whom (audit F-003): strangers are refused, real dealings and staff are allowed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mayMessage } from '../data/outboundMessageRepository.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

// tables: { profiles: {id: {role, invited_by}}, transactions: [true when a deal exists], ... }
function stub({ profiles = {}, deals = [] } = {}) {
  return {
    from(table) {
      let id = null
      const chain = {
        select() { return chain },
        eq(_c, v) { id = v; return chain },
        or() { return chain },
        limit() { return Promise.resolve({ data: deals.includes(table) ? [{ id: 1 }] : [] }) },
        single() { return Promise.resolve({ data: profiles[id] || null }) },
      }
      return chain
    },
  }
}

test('you may message yourself; malformed ids are refused', async () => {
  assert.equal(await mayMessage(stub(), A, A), true)
  assert.equal(await mayMessage(stub(), A, "x'),or(id.neq.0"), false)
  assert.equal(await mayMessage(stub(), null, B), false)
})

test('a stranger is refused', async () => {
  assert.equal(await mayMessage(stub({ profiles: { [A]: { role: 'client' } } }), A, B), false)
})

test('staff may message anyone', async () => {
  assert.equal(await mayMessage(stub({ profiles: { [A]: { role: 'admin' } } }), A, B), true)
})

test('people who share a job, escrow or dispute may message each other', async () => {
  for (const t of ['transactions', 'escrow_transactions', 'disputes', 'property_inspections']) {
    assert.equal(await mayMessage(stub({ profiles: { [A]: { role: 'client' } }, deals: [t] }), A, B), true, t)
  }
})

test('the caller may notify someone up their invite chain, not someone else', async () => {
  const profiles = { [A]: { role: 'client', invited_by: B }, [B]: { invited_by: C }, [C]: { invited_by: null } }
  assert.equal(await mayMessage(stub({ profiles }), A, C), true)
  assert.equal(await mayMessage(stub({ profiles: { ...profiles, [A]: { role: 'client', invited_by: null } } }), A, C), false)
})
