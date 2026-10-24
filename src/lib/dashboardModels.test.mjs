// Run with: node --test src/lib/dashboardModels.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { weeklyCounts, buildActivity, requestLink, SPARK_WEEKS } from './dashboardModels.js'

const NOW = Date.parse('2026-10-19T12:00:00Z')
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString()

test('weekly counts put this week last and older weeks before it', () => {
  const c = weeklyCounts([{ created_at: daysAgo(1) }, { created_at: daysAgo(2) }, { created_at: daysAgo(8) }, { created_at: daysAgo(15) }], NOW)
  assert.equal(c.length, SPARK_WEEKS)
  assert.equal(c[SPARK_WEEKS - 1], 2)
  assert.equal(c[SPARK_WEEKS - 2], 1)
  assert.equal(c[SPARK_WEEKS - 3], 1)
})

test('rows older than the window or dated in the future are ignored', () => {
  const c = weeklyCounts([{ created_at: daysAgo(7 * SPARK_WEEKS + 1) }, { created_at: daysAgo(-3) }], NOW)
  assert.equal(c.reduce((a, b) => a + b, 0), 0)
})

test('no rows gives all zeros', () => {
  assert.deepEqual(weeklyCounts(undefined, NOW), new Array(SPARK_WEEKS).fill(0))
})

test('activity merges listings and requests, newest first, capped', () => {
  const properties = [{ id: 'p1', title: 'Flat', price: 3500000, category: 'rental', status: 'active', created_at: daysAgo(3) }]
  const categoryListings = [{ id: 'l1', title: 'Plumbing', type: 'service', status: 'active', created_at: daysAgo(1) }]
  const requests = [{ request_id: 'r1', title: 'Fix a pipe', request_type: 'professional_request', status: 'OPEN', created_at: daysAgo(2) }]
  const a = buildActivity({ properties, categoryListings, requests })
  assert.deepEqual(a.map((x) => x.id), ['l1', 'r1', 'p1'])
  assert.equal(a[2].link, '/property/p1')
  assert.equal(a[2].sub, '₦3,500,000 · rental')
  assert.equal(a[0].link, null)
  assert.equal(a[1].kind, 'request')
})

test('activity is capped at the limit', () => {
  const requests = Array.from({ length: 10 }, (_, i) => ({ request_id: `r${i}`, title: 't', request_type: 'x', status: 's', created_at: daysAgo(i) }))
  assert.equal(buildActivity({ requests }).length, 6)
  assert.equal(buildActivity({ requests }, 3).length, 3)
})

test('missing parts are treated as empty', () => {
  assert.deepEqual(buildActivity({}), [])
})

test('a job request row opens its protected transaction; other requests have no link yet', () => {
  assert.equal(requestLink({ request_type: 'job', request_id: '42' }), '/transactions/transaction%3A42')
  assert.equal(requestLink({ request_type: 'rental', request_id: 'abc' }), null)
  assert.equal(requestLink({ request_type: 'job', request_id: null }), null)
})
