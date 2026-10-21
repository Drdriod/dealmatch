// Run with: node --test src/lib/devtoolsSignal.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeDevtools, createDevtoolsWatcher } from './devtoolsSignal.js'

const closed = { outerWidth: 1280, innerWidth: 1280, outerHeight: 800, innerHeight: 720, location: { pathname: '/rentals' } }
const docked = { ...closed, innerWidth: 900 }   // a docked panel takes 380px of width

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

test('a window much wider or taller than the page counts', () => {
  assert.equal(looksLikeDevtools(closed), false)
  assert.equal(looksLikeDevtools(docked), true)
  assert.equal(looksLikeDevtools({ ...closed, innerHeight: 500 }), true)
})

test('reported once per session, even when it opens and closes repeatedly', () => {
  const reports = []
  const win = { ...closed }
  const storage = memory()
  const check = createDevtoolsWatcher({ win, coarsePointer: false, storage, report: r => reports.push(r) })
  Object.assign(win, docked); assert.equal(check(), true)
  assert.equal(check(), false)                       // still open
  Object.assign(win, closed); assert.equal(check(), false)
  Object.assign(win, docked); assert.equal(check(), false)   // opened again, same session
  assert.deepEqual(reports, [{ url: '/rentals' }])
  // A new page load in the same browser session still does not report again.
  const again = createDevtoolsWatcher({ win, coarsePointer: false, storage, report: r => reports.push(r) })
  assert.equal(again(), false)
  assert.equal(reports.length, 1)
})

test('touch-first devices are never reported', () => {
  const reports = []
  const check = createDevtoolsWatcher({ win: { ...docked }, coarsePointer: true, storage: memory(), report: r => reports.push(r) })
  assert.equal(check(), false)
  assert.equal(reports.length, 0)
})

test('still reports once when session storage is blocked', () => {
  const reports = []
  const blocked = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  const check = createDevtoolsWatcher({ win: { ...docked }, coarsePointer: false, storage: blocked, report: r => reports.push(r) })
  assert.equal(check(), true)
  assert.equal(check(), false)
  assert.equal(reports.length, 1)
})
