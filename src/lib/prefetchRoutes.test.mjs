import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldPrefetch } from './prefetchRoutes.js'

test('prefetch runs when the browser gives no connection hint', () => {
  assert.equal(shouldPrefetch(undefined), true)
})
test('prefetch is skipped on Data Saver', () => {
  assert.equal(shouldPrefetch({ saveData: true, effectiveType: '4g' }), false)
})
test('prefetch is skipped on 2G and slow-2G, allowed on 3G and 4G', () => {
  assert.equal(shouldPrefetch({ effectiveType: '2g' }), false)
  assert.equal(shouldPrefetch({ effectiveType: 'slow-2g' }), false)
  assert.equal(shouldPrefetch({ effectiveType: '3g' }), true)
  assert.equal(shouldPrefetch({ effectiveType: '4g' }), true)
})
