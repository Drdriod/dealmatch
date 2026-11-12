// Run with: node --test src/lib/adminAccess.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isStaff, canSignInToAdmin, isSuperadmin, canMutateAdmin } from './adminAccess.js'

test('staff roles', () => {
  for (const r of ['admin', 'superadmin', 'agent', 'verifier']) assert.equal(isStaff(r), true, r)
  for (const r of ['buyer', 'landlord', 'student', '', null, undefined]) assert.equal(isStaff(r), false, String(r))
})

test('only the superadmin role is superadmin; an email never matters', () => {
  assert.equal(isSuperadmin('superadmin'), true)
  assert.equal(isSuperadmin('admin'), false)
  assert.equal(isSuperadmin(undefined), false)
})

test('sign-in and mutation sets', () => {
  assert.equal(canSignInToAdmin('superadmin'), true)
  assert.equal(canSignInToAdmin('verifier'), false) // unchanged: verifiers were not allowed on this page
  assert.equal(canMutateAdmin('admin'), true)
  assert.equal(canMutateAdmin('agent'), false)
})

// The reason this module exists: no personal email may decide access again.
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|jsx|mjs)$/.test(f) && !f.endsWith('.test.mjs')) out.push(p)
  }
  return out
}
test('no founder email address is written in the website or API code', () => {
  const root = new URL('../../', import.meta.url).pathname
  const hits = [...walk(join(root, 'src')), ...walk(join(root, 'api'))].filter((f) => /(divineandbassey|prosperwithbassey)@/.test(readFileSync(f, 'utf8')))
  assert.deepEqual(hits, [])
})
