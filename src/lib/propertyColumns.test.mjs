// Run with: node --test src/lib/propertyColumns.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PROPERTY_PUBLIC_COLUMN_LIST, PROPERTY_PUBLIC_COLUMNS, PROPERTY_PRIVATE_COLUMNS,
  PROPERTY_EXTRA_READABLE_COLUMNS, PROPERTY_BROWSER_READABLE_COLUMNS, PROPERTY_OWNER_COLUMNS,
} from './propertyColumns.js'

const MIGRATION = new URL('../../supabase/migrations/20261020000000_properties_column_exposure.sql', import.meta.url)

// The text of one `name text[] := ARRAY[ ... ];` declaration in the migration, as a list of names.
function migrationArray(name) {
  const sql = readFileSync(MIGRATION, 'utf8')
  const m = sql.match(new RegExp(`${name}\\s+text\\[\\]\\s*:=\\s*ARRAY\\[([\\s\\S]*?)\\]\\s*;`))
  assert.ok(m, `${name} not found in the migration`)
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

test('no private column is in any readable list', () => {
  for (const col of PROPERTY_PRIVATE_COLUMNS) {
    assert.equal(PROPERTY_BROWSER_READABLE_COLUMNS.includes(col), false, `${col} must not be readable`)
    assert.equal(PROPERTY_PUBLIC_COLUMN_LIST.includes(col), false, `${col} must not be public`)
    assert.doesNotMatch(PROPERTY_OWNER_COLUMNS, new RegExp(`\\b${col}\\b`))
  }
  assert.doesNotMatch(PROPERTY_PUBLIC_COLUMNS, /\*/)
  assert.doesNotMatch(PROPERTY_OWNER_COLUMNS, /\*/)
})

test('the contact and payment columns are the ones kept back', () => {
  for (const col of ['contact_phone', 'contact_email', 'payment_ref', 'assigned_agent_id', 'verification_notes']) {
    assert.ok(PROPERTY_PRIVATE_COLUMNS.includes(col), `${col} should be private`)
  }
})

test('the columns the listing pages draw are all present', () => {
  const needed = ['id', 'seller_id', 'title', 'price', 'state', 'city', 'address', 'bedrooms', 'bathrooms',
    'size_sqm', 'features', 'status', 'category', 'price_period', 'listing_type', 'property_type',
    'occupancy_status', 'created_at', 'latitude', 'longitude', 'video_url', 'rating', 'review_count',
    'landlord_name', 'rules', 'max_guests', 'verified_at']
  for (const col of needed) assert.ok(PROPERTY_PUBLIC_COLUMN_LIST.includes(col), `${col} missing`)
})

test('the lists have no duplicates and do not overlap', () => {
  assert.equal(new Set(PROPERTY_PUBLIC_COLUMN_LIST).size, PROPERTY_PUBLIC_COLUMN_LIST.length)
  assert.equal(new Set(PROPERTY_BROWSER_READABLE_COLUMNS).size, PROPERTY_BROWSER_READABLE_COLUMNS.length)
  assert.equal(new Set(PROPERTY_PRIVATE_COLUMNS).size, PROPERTY_PRIVATE_COLUMNS.length)
})

test('the owner list is the public list plus taxonomy columns, and nothing the database withholds', () => {
  for (const col of PROPERTY_OWNER_COLUMNS.split(',').map((c) => c.trim())) {
    assert.ok(PROPERTY_BROWSER_READABLE_COLUMNS.includes(col), `${col} is not granted to browsers`)
  }
})

// Every column in the production baseline has to be classified. When someone adds a column, this
// fails until they decide whether it is readable or private, instead of it being exposed by default.
test('every baseline column is classified as readable or private', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260711000000_production_baseline_schema.sql', import.meta.url), 'utf8')
  const body = sql.match(/CREATE TABLE public\.properties \(([\s\S]*?)\n\);/)[1]
  const columns = body.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(CONSTRAINT|PRIMARY|CHECK|UNIQUE|FOREIGN)\b/i.test(line))
    .map((line) => line.split(/\s+/)[0])
  assert.ok(columns.length > 30, 'baseline parse found too few columns')
  const classified = new Set([...PROPERTY_BROWSER_READABLE_COLUMNS, ...PROPERTY_PRIVATE_COLUMNS])
  for (const col of columns) assert.ok(classified.has(col), `${col} is not classified in propertyColumns.js`)
  // And the public list names only columns that exist in the baseline.
  for (const col of PROPERTY_PUBLIC_COLUMN_LIST) assert.ok(columns.includes(col), `${col} is not a baseline column`)
})

// The migration is what the database enforces. This file is what the code assumes. They must say
// the same thing, or a page can select a column the database refuses (or a private column can be
// granted by accident).
test('migration 18 grants exactly the readable columns and withholds exactly the private ones', () => {
  const granted = migrationArray('readable')
  const withheld = migrationArray('private_cols')
  assert.deepEqual([...granted].sort(), [...PROPERTY_BROWSER_READABLE_COLUMNS].sort())
  assert.deepEqual([...withheld].sort(), [...PROPERTY_PRIVATE_COLUMNS].sort())
  for (const col of PROPERTY_EXTRA_READABLE_COLUMNS) assert.ok(granted.includes(col))
})

test('migration 18 has no DROP statement (the SQL editor and the tool both run it as written)', () => {
  const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '')
  assert.doesNotMatch(sql, /\bDROP\b/i)
})
