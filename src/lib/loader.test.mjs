// Run with: node --test src/lib/loader.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoader, unwrap } from './loader.js'

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const track = (load) => { const seen = []; const loader = createLoader(load, (s) => seen.push(s)); return { loader, seen } }

test('unwrap returns data and throws the error of a failed query', () => {
  assert.deepEqual(unwrap({ data: [1], error: null }), [1])
  assert.equal(unwrap({ data: null, error: null }), null)
  const err = new Error('boom')
  assert.throws(() => unwrap({ data: null, error: err }), (e) => e === err)
})

test('starts as loading and ends with the data', async () => {
  const { loader, seen } = track(async () => ({ n: 1 }))
  assert.equal(loader.state.loading, true)
  await loader.execute()
  assert.deepEqual(loader.state, { data: { n: 1 }, error: null, loading: false })
  assert.equal(seen[0].loading, true)
})

test('a failed load records the error and does not pretend the data is empty', async () => {
  const err = new Error('network')
  const { loader } = track(async () => { throw err })
  await loader.execute()
  assert.equal(loader.state.loading, false)
  assert.equal(loader.state.error, err)
  assert.equal(loader.state.data, undefined)
})

test('a failed reload keeps the data already shown', async () => {
  let fail = false
  const { loader } = track(async () => { if (fail) throw new Error('later'); return 'first' })
  await loader.execute()
  fail = true
  await loader.execute()
  assert.equal(loader.state.data, 'first')
  assert.equal(loader.state.error.message, 'later')
  fail = false
  await loader.execute()
  assert.equal(loader.state.error, null)
})

test('a silent reload never switches loading on', async () => {
  const { loader, seen } = track(async () => 'x')
  await loader.execute()
  seen.length = 0
  await loader.execute({ silent: true })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].loading, false)
})

test('the newest request wins when an older one finishes late', async () => {
  const slow = deferred(), fast = deferred()
  const queue = [slow, fast]
  const { loader } = track(() => queue.shift().promise)
  const first = loader.execute()
  const second = loader.execute()
  fast.resolve('new'); await second
  slow.resolve('old'); await first
  assert.equal(loader.state.data, 'new')
})

test('a stale failure does not replace a newer success', async () => {
  const slow = deferred(), fast = deferred()
  const queue = [slow, fast]
  const { loader } = track(() => queue.shift().promise)
  const first = loader.execute()
  const second = loader.execute()
  fast.resolve('ok'); await second
  slow.reject(new Error('late failure')); await first
  assert.equal(loader.state.data, 'ok')
  assert.equal(loader.state.error, null)
})

test('nothing is reported after cancel', async () => {
  const d = deferred()
  const { loader, seen } = track(() => d.promise)
  const p = loader.execute()
  const before = seen.length
  loader.cancel()
  d.resolve('too late'); await p
  assert.equal(seen.length, before)
})
