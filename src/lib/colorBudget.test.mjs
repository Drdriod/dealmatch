import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// A ratchet, not a target: hard-coded hex colours in pages and components must not grow. New work uses the
// Tailwind tokens (bg-terracotta, text-deep, ...) or the CSS variables in index.css (var(--dm-terracotta)).
// When you remove hex colours, lower BASELINE to the new count so the gain is locked in.
const BASELINE = 2978

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsx') ? [p] : []
  })
}

test('hard-coded hex colours in .jsx files do not grow', () => {
  let count = 0
  for (const f of walk('src')) count += (readFileSync(f, 'utf8').match(/#[0-9A-Fa-f]{6}\b/g) || []).length
  assert.ok(count <= BASELINE, `${count} hex colours (limit ${BASELINE}). Use a Tailwind colour token or var(--dm-*) instead of a new hex value.`)
})
