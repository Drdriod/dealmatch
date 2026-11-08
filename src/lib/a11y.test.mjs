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

import { parseRgb, contrastRatio, readableOn } from './a11y.js'

test('gold and sage text on cream is darkened until it passes 4.5:1; on dark it is left alone', () => {
  const cream = { r: 247, g: 244, b: 237 }
  const dark = { r: 30, g: 21, b: 16 }
  const gold = parseRgb('rgb(212, 168, 83)')
  const sage = parseRgb('rgb(122, 158, 126)')
  for (const fg of [gold, sage]) {
    const fixed = readableOn(fg, cream)
    assert.ok(fixed, 'should be darkened on cream')
    assert.ok(contrastRatio(fixed, cream) >= 4.5)
    assert.equal(readableOn(fg, dark), null)
  }
  assert.equal(parseRgb('rgba(0, 0, 0, 0)').a, 0)
})
