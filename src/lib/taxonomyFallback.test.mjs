import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TAXONOMY_FALLBACK } from '../data/taxonomyFallback.js'

const sql = readFileSync(new URL('../../supabase/migrations/20261101000000_taxonomy_v3_merged.sql', import.meta.url), 'utf8')
const migrationGroups = [...sql.matchAll(/\('([a-z0-9-]+)',\s+'([^']+)',\s+NULL,\s+'(place|people)',\s+true/g)].map(m => ({ slug: m[1], name: m[2], pillar: m[3] }))
const migrationLeaves = [...sql.matchAll(/^\s+\('([a-z0-9-]+)',\s*'([^']+)',\s*'([a-z0-9-]+)'\)[,;]/gm)].map(m => ({ slug: m[1], name: m[2], grp: m[3] }))

test('the bundled taxonomy is the approved shape: 5 Place groups, 10 People groups, 71 subcategories', () => {
  assert.equal(TAXONOMY_FALLBACK.filter(g => g.pillar === 'place').length, 5)
  assert.equal(TAXONOMY_FALLBACK.filter(g => g.pillar === 'people').length, 10)
  assert.equal(TAXONOMY_FALLBACK.reduce((n, g) => n + g.children.length, 0), 71)
})

test('the bundled taxonomy equals the migration, group for group and name for name', () => {
  assert.equal(migrationGroups.length, 15)
  assert.equal(migrationLeaves.length, 71)
  for (const g of migrationGroups) {
    const bundled = TAXONOMY_FALLBACK.find(x => x.slug === g.slug)
    assert.ok(bundled, `group ${g.slug} missing`)
    assert.equal(bundled.name, g.name)
    assert.equal(bundled.pillar, g.pillar)
    const expected = migrationLeaves.filter(l => l.grp === g.slug).map(l => `${l.slug}|${l.name}`)
    assert.deepEqual(bundled.children.map(c => `${c.slug}|${c.name}`), expected, g.slug)
  }
})

test('slugs are unique across groups and subcategories', () => {
  const all = TAXONOMY_FALLBACK.flatMap(g => [g.slug, ...g.children.map(c => c.slug)])
  assert.equal(new Set(all).size, all.length)
})
