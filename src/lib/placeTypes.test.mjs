import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLACE_TYPES, isSaleListing, placeFilter, placeBadge, priceSuffix, emptyListPath } from './placeTypes.js'

test('the sale form values count as sales, rentals do not', () => {
  assert.equal(isSaleListing({ category: 'sale', listing_type: 'For Sale' }), true)
  assert.equal(isSaleListing({ listing_type: 'For Sale' }), true)
  assert.equal(isSaleListing({ listing_type: 'Joint Venture' }), true)
  assert.equal(isSaleListing({ listing_type: 'Off-Plan' }), true)
  assert.equal(isSaleListing({ category: 'rental', listing_type: 'Rental' }), false)
  assert.equal(isSaleListing({ category: 'shortlet', listing_type: 'Short-let' }), false)
  assert.equal(isSaleListing(null), false)
})

test('every tab maps to the right rows', () => {
  assert.deepEqual(placeFilter('All'), { categories: ['rental', 'shortlet', 'sale'], land: null })
  assert.deepEqual(placeFilter('Rental'), { categories: ['rental'], land: null })
  assert.deepEqual(placeFilter('Short-let'), { categories: ['shortlet'], land: null })
  assert.deepEqual(placeFilter('Buy'), { categories: ['sale'], land: 'exclude' })
  assert.deepEqual(placeFilter('Land'), { categories: ['sale'], land: 'only' })
  assert.equal(PLACE_TYPES.length, 5)
})

test('badges and price suffixes', () => {
  assert.equal(placeBadge({ category: 'sale', property_type: 'land' }), 'Land')
  assert.equal(placeBadge({ category: 'sale', property_type: 'detached' }), 'For sale')
  assert.equal(placeBadge({ category: 'shortlet' }), 'Short-let')
  assert.equal(placeBadge({ category: 'rental' }), 'Rental')
  assert.equal(priceSuffix({ category: 'sale' }), '')
  assert.equal(priceSuffix({ category: 'shortlet' }), ' / night')
  assert.equal(priceSuffix({ category: 'rental' }), ' / yr')
})

test('empty-state button sends sellers to the right form', () => {
  assert.equal(emptyListPath('Land'), '/list')
  assert.equal(emptyListPath('Buy'), '/list')
  assert.equal(emptyListPath('Rental'), '/list-rental')
  assert.equal(emptyListPath('All'), '/list-rental')
})
