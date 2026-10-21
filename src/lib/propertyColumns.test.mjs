// Run with: node --test src/lib/propertyColumns.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PROPERTY_PUBLIC_COLUMN_LIST, PROPERTY_PUBLIC_COLUMNS, PROPERTY_PRIVATE_COLUMNS,
} from './propertyColumns.js'

test('no private column is in the public list', () => {
  for (const col of PROPERTY_PRIVATE_COLUMNS) {
    assert.equal(PROPERTY_PUBLIC_COLUMN_LIST.includes(col), false, `${col} must not be public`)
  }
  assert.doesNotMatch(PROPERTY_PUBLIC_COLUMNS, /\*/)
})

test('the contact and payment columns are the ones kept back', () => {
  for (const col of ['contact_phone', 'contact_email', 'payment_ref']) {
    assert.ok(PROPERTY_PRIVATE_COLUMNS.includes(col))
  }
})

test('the columns the listing pages draw are all present', () => {
  const needed = ['id', 'seller_id', 'title', 'price', 'state', 'city', 'address', 'bedrooms', 'bathrooms',
    'size_sqm', 'features', 'status', 'category', 'price_period', 'listing_type', 'property_type',
    'occupancy_status', 'created_at', 'latitude', 'longitude', 'video_url', 'rating', 'review_count',
    'landlord_name', 'rules', 'max_guests', 'verified_at']
  for (const col of needed) assert.ok(PROPERTY_PUBLIC_COLUMN_LIST.includes(col), `${col} missing`)
})

test('the list has no duplicates', () => {
  assert.equal(new Set(PROPERTY_PUBLIC_COLUMN_LIST).size, PROPERTY_PUBLIC_COLUMN_LIST.length)
})

// Every column in the production baseline has to be classified. When someone adds a column, this
// fails until they decide whether it is public or private, instead of it being exposed by default.
test('every baseline column is classified as public or private', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260711000000_production_baseline_schema.sql', import.meta.url), 'utf8')
  const body = sql.match(/CREATE TABLE public\.properties \(([\s\S]*?)\n\);/)[1]
  const columns = body.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(CONSTRAINT|PRIMARY|CHECK|UNIQUE|FOREIGN)\b/i.test(line))
    .map((line) => line.split(/\s+/)[0])
  assert.ok(columns.length > 30, 'baseline parse found too few columns')
  const classified = new Set([...PROPERTY_PUBLIC_COLUMN_LIST, ...PROPERTY_PRIVATE_COLUMNS])
  for (const col of columns) assert.ok(classified.has(col), `${col} is not classified in propertyColumns.js`)
  // And the public list names only columns that exist in the baseline.
  for (const col of PROPERTY_PUBLIC_COLUMN_LIST) assert.ok(columns.includes(col), `${col} is not a baseline column`)
})
