import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanSearchTerm } from './searchTerm.js'

test('plain text passes through, trimmed', () => {
  assert.equal(cleanSearchTerm('  lekki phase 1  '), 'lekki phase 1')
})

test('a comma cannot start another condition', () => {
  assert.equal(cleanSearchTerm('ada,role.eq.admin'), 'ada role.eq.admin')
  assert.equal(cleanSearchTerm('Victoria Island, Lagos'), 'Victoria Island  Lagos')
})

test('parentheses, asterisks, quotes and backslashes are removed', () => {
  assert.equal(cleanSearchTerm('3 bed (Lekki)'), '3 bed  Lekki')
  assert.equal(cleanSearchTerm('a*b'), 'a b')
  assert.equal(cleanSearchTerm('say "hi"'), 'say  hi')
  assert.equal(cleanSearchTerm('a\\b'), 'a b')
})

test('nothing usable becomes an empty string', () => {
  assert.equal(cleanSearchTerm(',,()'), '')
  assert.equal(cleanSearchTerm(''), '')
  assert.equal(cleanSearchTerm(null), '')
  assert.equal(cleanSearchTerm(undefined), '')
})

test('non-string input is converted rather than thrown on', () => {
  assert.equal(cleanSearchTerm(42), '42')
})
