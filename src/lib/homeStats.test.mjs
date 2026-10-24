import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHomeStats, HOME_STATS_MILESTONE } from './homeStats.js'

test('no numbers are shown below the milestone', () => {
  assert.equal(buildHomeStats({ properties: 0, verified: 0, sold: 0 }), null)
  assert.equal(buildHomeStats({ properties: 5, verified: 200, sold: 9 }), null)
  assert.equal(buildHomeStats({ properties: 500, verified: 3, sold: 9 }), null)
  assert.equal(buildHomeStats(undefined), null)
})

test('numbers appear only when both counts reach the milestone', () => {
  const tiles = buildHomeStats({
    properties: HOME_STATS_MILESTONE.activeProperties,
    verified: HOME_STATS_MILESTONE.verifiedUsers,
    sold: 4,
  })
  assert.deepEqual(tiles.map((t) => t.label), ['Properties Listed', 'Verified Users', 'Powered Matching', 'Deals Closed'])
})

test('a zero deals count is left out instead of printed', () => {
  const tiles = buildHomeStats({ properties: 80, verified: 150, sold: 0 })
  assert.equal(tiles.some((t) => t.label === 'Deals Closed'), false)
})
