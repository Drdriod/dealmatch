import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEATS, PHASES, findSeat, normaliseCode } from '../data/testSeats.js'

test('every seat has a unique code in the CODE-SUFFIX format', () => {
  const codes = SEATS.map((s) => s.code)
  assert.equal(new Set(codes).size, codes.length)
  for (const code of codes) assert.match(code, /^(T\d{1,2}|S1)-[A-Z]+-[A-Z2-9]{4}$/)
})

test('there are 11 seats and every seat id appears once', () => {
  assert.equal(SEATS.length, 11)
  assert.equal(new Set(SEATS.map((s) => s.seat)).size, 11)
})

test('supply seats come before demand seats, and demand before stress', () => {
  const order = SEATS.map((s) => s.phase)
  const lastSupply = order.lastIndexOf('supply')
  const firstDemand = order.indexOf('demand')
  const lastDemand = order.lastIndexOf('demand')
  const firstStress = order.indexOf('stress')
  assert.ok(lastSupply < firstDemand)
  assert.ok(lastDemand < firstStress)
  for (const seat of SEATS) assert.ok(PHASES[seat.phase], `${seat.seat} has a known phase`)
})

test('every step has an instruction, an expected result and an in-app link', () => {
  for (const seat of SEATS) {
    assert.ok(seat.steps.length >= 3, `${seat.seat} has steps`)
    for (const step of seat.steps) {
      assert.ok(step.do && step.expect, `${seat.seat} step is complete`)
      assert.ok(step.to.startsWith('/'), `${seat.seat} link is an in-app path`)
    }
  }
})

test('codes are found regardless of case and spaces, and unknown codes are not', () => {
  assert.equal(normaliseCode('  t1-rent-nwkv '), 'T1-RENT-NWKV')
  assert.equal(findSeat(' t4-landlord-w5z8 ').seat, 'T4')
  assert.equal(findSeat('T1-RENT-AAAA'), null)
  assert.equal(findSeat(''), null)
})
