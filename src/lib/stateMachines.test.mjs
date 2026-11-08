// Run with: node --test src/lib/stateMachines.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MACHINES, UNCATALOGUED, canMove, isKnownState, isModelled, getMachine, toMermaid } from './stateMachines.js'
import { PAYOUT_TRANSITIONS } from './payoutStates.js'
import { renderStateMachineDocs } from './stateMachineDocs.js'

const ENFORCERS = new Set(['transition-trigger', 'conditional-update', 'check-constraint', 'none'])
const entries = Object.entries(MACHINES)

test('every machine names its table, column, a known initial state and a known enforcer', () => {
  for (const [name, m] of entries) {
    assert.ok(m.table && m.column, `${name}: table and column`)
    assert.ok(isKnownState(name, m.initial), `${name}: initial "${m.initial}" is not a listed state`)
    assert.ok(Object.keys(m.states).length >= 2, `${name}: at least two states`)
    assert.ok(m.enforcedBy.length > 0 && m.enforcedBy.every((e) => ENFORCERS.has(e)), `${name}: enforcedBy`)
  }
})

test('no two machines claim the same table column', () => {
  const seen = new Map()
  for (const [name, m] of entries) {
    const key = `${m.table}.${m.column}`
    assert.ok(!seen.has(key), `${key} is described by both ${seen.get(key)} and ${name}`)
    seen.set(key, name)
  }
  for (const u of UNCATALOGUED) assert.ok(!seen.has(u), `${u} is both catalogued and listed as uncatalogued`)
})

test('modelled machines: every move targets a listed state, every state has a row, every state is reachable', () => {
  for (const [name, m] of entries.filter(([, x]) => x.transitions)) {
    const states = Object.keys(m.states)
    assert.deepEqual(Object.keys(m.transitions).sort(), [...states].sort(), `${name}: transitions need a row for every state`)
    for (const [from, tos] of Object.entries(m.transitions)) {
      for (const to of tos) assert.ok(states.includes(to), `${name}: ${from} -> ${to} targets an unknown state`)
      assert.ok(!tos.includes(from), `${name}: ${from} moves to itself`)
    }
    const reached = new Set([m.initial])
    const queue = [m.initial]
    while (queue.length) for (const to of m.transitions[queue.pop()]) if (!reached.has(to)) { reached.add(to); queue.push(to) }
    // A payout can be retried from failed, so reachability is checked from the initial state only.
    const expected = states.filter((x) => !(m.unwritten || []).includes(x))
    assert.deepEqual([...reached].sort(), expected.sort(), `${name}: unreachable states: ${expected.filter((x) => !reached.has(x))}`)
  }
})

test('the payout machine IS the one in payoutStates.js, not a copy', () => {
  assert.equal(MACHINES.payout_queue.transitions, PAYOUT_TRANSITIONS)
})

test('canMove answers true/false for modelled machines and null for catalogued ones', () => {
  assert.equal(canMove('escrow', 'funded', 'released'), true)
  assert.equal(canMove('escrow', 'released', 'funded'), false)
  assert.equal(canMove('escrow', 'nope', 'funded'), false)
  assert.equal(canMove('booking', 'confirmed', 'cancelled'), null)
  assert.equal(isModelled('property'), true)
  assert.equal(isModelled('booking'), false)
  assert.throws(() => getMachine('missing'), /Unknown state machine/)
})

test('statuses the code writes are listed (property and escrow)', () => {
  for (const s of ['pending_review', 'under_verification', 'active', 'rejected', 'paused', 'removed', 'sold', 'rented']) assert.ok(isKnownState('property', s), s)
  for (const s of ['awaiting_payment', 'funded', 'released', 'refunded']) assert.ok(isKnownState('escrow', s), s)
})

test('the mermaid source has one arrow per move', () => {
  const m = toMermaid('escrow')
  assert.match(m, /awaiting_payment --> funded/)
  assert.match(m, /funded --> refunded/)
  assert.equal(toMermaid('booking'), null)
})

test('docs/STATE_MACHINES.md is up to date (run: npm run docs:states)', () => {
  const file = readFileSync(new URL('../../docs/STATE_MACHINES.md', import.meta.url), 'utf8')
  assert.equal(file, renderStateMachineDocs())
})
