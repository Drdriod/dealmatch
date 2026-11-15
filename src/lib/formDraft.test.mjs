import test from 'node:test'
import assert from 'node:assert/strict'

// A tiny in-memory localStorage, installed before the module is used.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => { store.delete(k) },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size },
}

const { draftKey, sanitizeDraft, readDraft, writeDraft, removeDraft, clearAllDrafts, DRAFT_TTL_MS } = await import('./formDraft.js')

test('draft keys are scoped to the user and form', () => {
  assert.notEqual(draftKey('list-property', 'a'), draftKey('list-property', 'b'))
  assert.notEqual(draftKey('list-property', 'a'), draftKey('post-job', 'a'))
  assert.match(draftKey('x'), /guest/)
})

test('sanitizeDraft drops files, blob and data urls and omitted fields', () => {
  const file = new Blob(['x'])
  const out = sanitizeDraft({
    title: 'Flat', password: 'secret', images: ['blob:abc', 'https://x/y.jpg', 'data:image/png;base64,AA', file],
    nested: { keep: 1, drop: file },
  }, ['password'])
  assert.deepEqual(out, { title: 'Flat', images: ['https://x/y.jpg'], nested: { keep: 1 } })
})

test('write then read returns the saved data', () => {
  const k = draftKey('t', 'u1')
  assert.equal(writeDraft(k, { a: 1 }, 1000), true)
  assert.deepEqual(readDraft(k, DRAFT_TTL_MS, 2000).data, { a: 1 })
})

test('an old draft is expired and removed', () => {
  const k = draftKey('t', 'u2')
  writeDraft(k, { a: 1 }, 0)
  assert.equal(readDraft(k, DRAFT_TTL_MS, DRAFT_TTL_MS + 1), null)
  assert.equal(localStorage.getItem(k), null)
})

test('a damaged draft is ignored, not thrown', () => {
  const k = draftKey('t', 'u3')
  localStorage.setItem(k, '{not json')
  assert.equal(readDraft(k), null)
})

test('removeDraft and clearAllDrafts only touch draft keys', () => {
  localStorage.setItem('dealmatch-auth-token', 'keep')
  writeDraft(draftKey('a', 'u'), { x: 1 })
  writeDraft(draftKey('b', 'u'), { x: 2 })
  removeDraft(draftKey('a', 'u'))
  assert.equal(readDraft(draftKey('a', 'u')), null)
  clearAllDrafts()
  assert.equal(readDraft(draftKey('b', 'u')), null)
  assert.equal(localStorage.getItem('dealmatch-auth-token'), 'keep')
})

test('storage that throws never breaks a form', () => {
  const real = globalThis.localStorage
  globalThis.localStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') }, removeItem() { throw new Error('x') }, key() { return null }, length: 0 }
  assert.equal(writeDraft('k', {}), false)
  assert.equal(readDraft('k'), null)
  assert.doesNotThrow(() => { removeDraft('k'); clearAllDrafts() })
  globalThis.localStorage = real
})
