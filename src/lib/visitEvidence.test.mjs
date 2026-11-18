import test from 'node:test'
import assert from 'node:assert/strict'
import { visitCodeFor, visitCodeMatches, photoPathsAreOwn, evaluatePhotoEvidence } from './visitEvidence.js'

const SECRET = 'test-secret'
const prop = { latitude: 5.0, longitude: 7.9 }
const session = { server_t0: '2026-11-18T10:00:00Z' }

test('visit code is six digits, stable per session and differs between sessions', () => {
  const a = visitCodeFor('s1', SECRET)
  assert.match(a, /^\d{6}$/)
  assert.equal(a, visitCodeFor('s1', SECRET))
  assert.notEqual(a, visitCodeFor('s2', SECRET))
  assert.notEqual(a, visitCodeFor('s1', 'other-secret'))
})

test('visit code check accepts the right code and refuses wrong, short or empty input', () => {
  const code = visitCodeFor('s1', SECRET)
  assert.equal(visitCodeMatches('s1', SECRET, code), true)
  assert.equal(visitCodeMatches('s1', SECRET, ` ${code.slice(0, 3)} ${code.slice(3)} `), true)
  assert.equal(visitCodeMatches('s1', SECRET, '000000' === code ? '000001' : '000000'), false)
  assert.equal(visitCodeMatches('s1', SECRET, '123'), false)
  assert.equal(visitCodeMatches('s1', SECRET, undefined), false)
})

test('photo paths must be in the agent folder for this property', () => {
  assert.equal(photoPathsAreOwn(['a1/p1/x.jpg', 'a1/p1/y.jpg'], 'a1', 'p1'), true)
  assert.equal(photoPathsAreOwn(['a2/p1/x.jpg'], 'a1', 'p1'), false)
  assert.equal(photoPathsAreOwn(['a1/p2/x.jpg'], 'a1', 'p1'), false)
  assert.equal(photoPathsAreOwn(['a1/p1/../../a2/p1/x.jpg'], 'a1', 'p1'), false)
  assert.equal(photoPathsAreOwn([], 'a1', 'p1'), false)
})

test('a photo tagged far from the property rejects the visit', () => {
  const r = evaluatePhotoEvidence([{ latitude: 6.5, longitude: 3.4, takenAt: null }], prop, session)
  assert.equal(r.reject, true)
  assert.ok(r.checks.max_distance_m > 250)
})

test('photos near the property pass and are counted', () => {
  const r = evaluatePhotoEvidence([{ latitude: 5.0005, longitude: 7.9005 }, { latitude: 5.0001, longitude: 7.9 }], prop, session)
  assert.equal(r.reject, false)
  assert.equal(r.checks.with_gps, 2)
})

test('photos without a GPS tag or unreadable do not reject but are recorded', () => {
  const r = evaluatePhotoEvidence([{ latitude: null, longitude: null }, null], prop, session)
  assert.equal(r.reject, false)
  assert.equal(r.checks.without_gps, 1)
  assert.equal(r.checks.unreadable, 1)
})

test('a photo taken long before the visit is noted', () => {
  const r = evaluatePhotoEvidence([{ latitude: 5.0, longitude: 7.9, takenAt: '2026-11-10T10:00:00Z' }], prop, session)
  assert.equal(r.reject, false)
  assert.equal(r.checks.taken_before_visit, 1)
})
