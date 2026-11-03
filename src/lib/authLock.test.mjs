import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

// authLock lives in supabase.js, which builds a client at import time and needs browser globals.
// So this test lifts the function's own source out of that file and runs it with stand-in
// navigator, timers and wait time. The code under test is the real code.
async function loadAuthLock(navigatorStub) {
  const src = await readFile(new URL('./supabase.js', import.meta.url), 'utf8')
  const start = src.indexOf('export async function authLock')
  const end = src.indexOf('export const supabase')
  assert.ok(start > 0 && end > start, 'authLock not found in supabase.js')
  const body = src.slice(start, end).replace('export async function', 'async function') + '\nreturn authLock'
  return new Function('AUTH_LOCK_WAIT_MS', 'navigator', body)(30, navigatorStub)
}

test('authLock runs the work straight away when nobody holds the lock', async () => {
  const authLock = await loadAuthLock({ locks: { request: async (_n, _o, cb) => cb() } })
  assert.equal(await authLock('x', 0, async () => 'done'), 'done')
})

test('authLock carries on after the wait when another tab never lets go', async () => {
  const stuck = { locks: { request: (_n, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) } }
  const authLock = await loadAuthLock(stuck)
  const t0 = Date.now()
  assert.equal(await authLock('x', 0, async () => 'ran-anyway'), 'ran-anyway')
  assert.ok(Date.now() - t0 < 1000)
})

test('authLock just runs when the browser has no Web Locks', async () => {
  const authLock = await loadAuthLock({})
  assert.equal(await authLock('x', 0, async () => 'plain'), 'plain')
})

test('an error from the work itself is not swallowed', async () => {
  const authLock = await loadAuthLock({ locks: { request: async (_n, _o, cb) => cb() } })
  await assert.rejects(authLock('x', 0, async () => { throw new Error('boom') }), /boom/)
})
