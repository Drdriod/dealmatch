#!/usr/bin/env node
/**
 * Architecture Fitness Functions — DealMatch
 * =============================================
 * Concrete, automated checks for the architecture characteristics/decisions
 * recorded in the Phase 2 architecture review (ADR-003, Section 6). This is
 * the thing that was recommended twice in prior review documents and never
 * actually built — recommendations in a document aren't architecture until
 * something enforces them automatically.
 *
 * Two categories of check, deliberately different severities:
 *
 * 1. BLOCKING — module boundary violations on tables owned by the NEW
 *    component system (Catalog, Listings, Forum). This code has no
 *    historical excuse to reach across boundaries, so violations fail CI.
 *
 * 2. INFORMATIONAL — direct access to LEGACY tables (properties,
 *    professional_applications, etc.) from outside any module. These
 *    predate the module system entirely (see ADR-002 in the architecture
 *    review — migrating them is a separate, larger, not-yet-approved
 *    decision). This check counts and reports them as a visible baseline,
 *    it does not fail the build. Blocking on pre-existing legacy code would
 *    just make this script something everyone learns to ignore.
 *
 * 3. Serverless function count budget (<=11, per the platform constraint
 *    this thread has been hand-enforcing all session).
 *
 * Run: npm run check:fitness
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, extname } from 'path'

const ROOT = process.cwd()

// Tables owned by the new, post-multicategory-catalog module system.
// Cross-module access to these is a real, blocking violation.
const OWNED_TABLES = {
  categories: 'src/modules/catalog',
  category_listings: 'src/modules/listings',
  forum_categories: 'src/modules/forum',
  forum_threads: 'src/modules/forum',
  forum_posts: 'src/modules/forum',
}

const FUNCTION_COUNT_BUDGET = 11

function walk(dir, exts, skip = ['node_modules', '.git', 'dist', 'build']) {
  let out = []
  for (const entry of readdirSync(dir)) {
    if (skip.includes(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out = out.concat(walk(full, exts, skip))
    else if (exts.includes(extname(entry))) out.push(full)
  }
  return out
}

function findTableAccess(files) {
  const hits = [] // { file, table, line }
  const pattern = /\.from\(\s*['"]([a-z_]+)['"]\s*\)/g
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    lines.forEach((line, i) => {
      let m
      pattern.lastIndex = 0
      while ((m = pattern.exec(line))) {
        hits.push({ file: relative(ROOT, file), table: m[1], line: i + 1 })
      }
    })
  }
  return hits
}

function checkBoundaries() {
  const files = [...walk(join(ROOT, 'api'), ['.js']), ...walk(join(ROOT, 'src'), ['.js', '.jsx'])]
  const hits = findTableAccess(files)

  const violations = []
  const legacyAccess = {}

  for (const hit of hits) {
    const owner = OWNED_TABLES[hit.table]
    if (owner) {
      const insideOwner = hit.file.startsWith(owner.replace(/\\/g, '/'))
      if (!insideOwner) violations.push(hit)
    } else {
      legacyAccess[hit.table] = legacyAccess[hit.table] || new Set()
      legacyAccess[hit.table].add(hit.file)
    }
  }

  return { violations, legacyAccess }
}

function checkFunctionCount() {
  const apiFiles = walk(join(ROOT, 'api'), ['.js'])
  return apiFiles.length
}

function main() {
  console.log('DealMatch Architecture Fitness Functions\n' + '='.repeat(42))

  let failed = false

  // 1. Module boundary check (blocking)
  const { violations, legacyAccess } = checkBoundaries()
  console.log('\n[1] Module boundary check (new-module tables, BLOCKING)')
  if (violations.length === 0) {
    console.log('    PASS: no cross-module access to owned tables found.')
  } else {
    failed = true
    console.log(`    FAIL: ${violations.length} violation(s):`)
    for (const v of violations) {
      console.log(`      ${v.file}:${v.line} accesses '${v.table}' (owned by ${OWNED_TABLES[v.table]})`)
    }
  }

  // 2. Legacy access report (informational)
  console.log('\n[2] Legacy table access (INFORMATIONAL: not blocking, see ADR-002)')
  const legacyTables = Object.keys(legacyAccess).sort()
  if (legacyTables.length === 0) {
    console.log('    No legacy table access found.')
  } else {
    console.log(`    ${legacyTables.length} legacy table(s) accessed directly from ${
      new Set(legacyTables.flatMap(t => [...legacyAccess[t]])).size} file(s):`)
    for (const t of legacyTables) {
      console.log(`      ${t}: ${legacyAccess[t].size} file(s)`)
    }
    console.log('    This is the quantified baseline ADR-002\'s migration decision would address.')
  }

  // 3. Function count budget (blocking)
  const fnCount = checkFunctionCount()
  console.log(`\n[3] Serverless function count budget (BLOCKING, budget: ${FUNCTION_COUNT_BUDGET})`)
  if (fnCount <= FUNCTION_COUNT_BUDGET) {
    console.log(`    PASS: ${fnCount}/${FUNCTION_COUNT_BUDGET} functions.`)
  } else {
    failed = true
    console.log(`    FAIL: ${fnCount}/${FUNCTION_COUNT_BUDGET} functions. Consolidate into api/platform.js before adding more.`)
  }

  console.log('\n' + '='.repeat(42))
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
  process.exit(failed ? 1 : 0)
}

main()
