import test from 'node:test'
import assert from 'node:assert/strict'
import { titleFor } from './a11y.js'

test('titleFor builds a page title and skips empty or site-only text', () => {
  assert.equal(titleFor('My Offers'), 'My Offers | DealMatch')
  assert.equal(titleFor('  Account   Settings '), 'Account Settings | DealMatch')
  assert.equal(titleFor(''), null)
  assert.equal(titleFor(null), null)
  assert.equal(titleFor('DealMatch'), null)
  assert.ok(titleFor('x'.repeat(200)).length <= 70 + ' | DealMatch'.length)
})
