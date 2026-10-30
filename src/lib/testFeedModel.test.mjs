import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEATS } from '../data/testSeats.js'
import { buildReport, summariseSeats, filterReports } from './testFeedModel.js'

const seat = SEATS[0]

test('a report needs a name and an outcome', () => {
  assert.equal(buildReport(seat, { name: '', outcome: 'passed' }).ok, false)
  assert.equal(buildReport(seat, { name: 'Ada', outcome: 'nope' }).ok, false)
})

test('a problem report needs a description, a pass does not', () => {
  assert.equal(buildReport(seat, { name: 'Ada', outcome: 'problems' }).ok, false)
  assert.equal(buildReport(seat, { name: 'Ada', outcome: 'passed' }).ok, true)
  const r = buildReport(seat, { name: 'Ada', outcome: 'stuck', severity: 'S2', happened: 'Pay button did nothing' })
  assert.equal(r.ok, true)
  assert.equal(r.row.seat_code, seat.code)
  assert.equal(r.row.severity, 'S2')
})

test('unknown severity falls back to none and long text is cut', () => {
  const r = buildReport(seat, { name: 'Ada', outcome: 'passed', severity: 'S9', tried: 'x'.repeat(5000) })
  assert.equal(r.row.severity, 'none')
  assert.equal(r.row.tried.length, 2000)
})

test('board shows not started, in progress and finished seats', () => {
  const [a, b, c] = SEATS
  const progress = [
    { seat_code: a.code, done: [0, 1], total: a.steps.length, updated_at: '2026-10-30T10:00:00Z' },
    { seat_code: b.code, done: b.steps.map((_, i) => i), total: b.steps.length, updated_at: '2026-10-30T11:00:00Z' },
  ]
  const reports = [
    { seat_code: b.code, outcome: 'passed', severity: 'none', created_at: '2026-10-30T11:05:00Z' },
    { seat_code: a.code, outcome: 'problems', severity: 'S1', created_at: '2026-10-30T10:30:00Z' },
  ]
  const rows = summariseSeats(SEATS, progress, reports)
  assert.equal(rows.find((r) => r.code === a.code).state, 'in progress')
  assert.equal(rows.find((r) => r.code === a.code).worst, 'S1')
  assert.equal(rows.find((r) => r.code === b.code).state, 'finished')
  assert.equal(rows.find((r) => r.code === c.code).state, 'not started')
  assert.equal(rows.find((r) => r.code === b.code).lastActivity, '2026-10-30T11:05:00Z')
})

test('filter by seat and severity', () => {
  const reports = [
    { seat_code: 'A', severity: 'S1' },
    { seat_code: 'A', severity: 'S3' },
    { seat_code: 'B', severity: 'S1' },
  ]
  assert.equal(filterReports(reports, { seat: 'A' }).length, 2)
  assert.equal(filterReports(reports, { severity: 'S1' }).length, 2)
  assert.equal(filterReports(reports, { seat: 'A', severity: 'S1' }).length, 1)
})
