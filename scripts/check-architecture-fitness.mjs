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

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'fs'
import { join, relative, extname } from 'path'
import { PROPERTY_BROWSER_READABLE_COLUMNS, PROPERTY_PRIVATE_COLUMNS } from '../src/lib/propertyColumns.js'

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

// ── Architecture rules added with the design-pattern work ──────────────────
// See docs/architecture/design-patterns.md and docs/ARCHITECTURE.md section 9.

// 4. Adapter rule (BLOCKING, zero tolerance): only the gateway adapter may
//    call Flutterwave. Everything else calls paymentGateway.<operation>().
const GATEWAY_FILES = ['src/lib/paymentGateway.js', 'src/lib/flutterwaveServer.js']
const FLW_RAW = /\bflw\(|'\/(charges|transfers|virtual-accounts|customers|banks)\b/

function checkGatewayAdapter() {
  const offenders = []
  for (const scope of ['src', 'api']) {
    for (const file of walk(join(ROOT, scope), ['.js', '.jsx', '.mjs'])) {
      const rel = relative(ROOT, file)
      if (GATEWAY_FILES.includes(rel) || rel.endsWith('.test.mjs')) continue
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (FLW_RAW.test(line)) offenders.push({ file: rel, line: i + 1 })
      })
    }
  }
  return offenders
}

// 5. Factory rule (BLOCKING, zero tolerance): notification rows are written only
//    by the factory (server) and the client facade. Everything else calls
//    insertNotification() or notifyUser().
const NOTIFICATION_WRITERS = ['src/lib/notificationFactory.js', 'src/lib/notifications.js']
const NOTIFICATION_INSERT = /from\('notifications'\)\s*\.insert\(/

function checkNotificationFactory() {
  const offenders = []
  for (const scope of ['src', 'api']) {
    for (const file of walk(join(ROOT, scope), ['.js', '.jsx'])) {
      const rel = relative(ROOT, file)
      if (NOTIFICATION_WRITERS.includes(rel)) continue
      const text = readFileSync(file, 'utf8')
      if (NOTIFICATION_INSERT.test(text)) offenders.push({ file: rel })
    }
  }
  return offenders
}

// 6. Repository ratchet (BLOCKING, cannot grow): each file's direct database
//    calls may go down, never up. A new file with database calls must go
//    through a repository in src/data/. The baseline is committed in
//    scripts/architecture-baseline.json; lower it with --update-baseline.
const DB_CALL = /\b(supabase|svc)\s*\.\s*(from|rpc)\s*\(/g
const DB_SCOPES = ['src/pages', 'src/components', 'api']
const BASELINE_PATH = join(ROOT, 'scripts', 'architecture-baseline.json')

function dbCallsByFile() {
  const counts = {}
  for (const scope of DB_SCOPES) {
    for (const file of walk(join(ROOT, scope), ['.js', '.jsx'])) {
      const n = (readFileSync(file, 'utf8').match(DB_CALL) || []).length
      if (n > 0) counts[relative(ROOT, file)] = n
    }
  }
  return counts
}

function checkDbRatchet(counts) {
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {}
  const problems = []
  for (const [file, n] of Object.entries(counts)) {
    if (!(file in baseline)) {
      problems.push(`${file}: new file with ${n} direct database call(s); add a repository in src/data/`)
    } else if (n > baseline[file]) {
      problems.push(`${file}: ${baseline[file]} -> ${n} direct database calls; move the new query into a repository`)
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const baseTotal = Object.values(baseline).reduce((a, b) => a + b, 0)
  return { problems, total, baseTotal, files: Object.keys(counts).length }
}

// 7. Property reads name their columns (BLOCKING). Migration 18 removes table-level SELECT on
//    properties from the browser roles (anon, authenticated), so `select('*')`, an empty
//    `select()` (which returns every column), and a head-count `*` all fail there with
//    "permission denied". They would also have handed the seller's contact_phone and contact_email
//    to anyone before that. Use the lists in src/lib/propertyColumns.js, and select('id', ...) for
//    counts.
//    Files that run only on the service role are not limited by the grants. Each is listed with
//    the reason, and is also exempt from check 9.
const PROPERTY_SERVICE_ROLE_FILES = {
  'src/data/adminApiRepository.js': 'service-role admin counts and lists',
  'src/data/agentVerificationRepository.js': 'service-role agent verification; reads assigned_agent_id',
}

// Text inside the parentheses that open at `start` (the index just after "("). Quote-aware,
// because column lists contain parentheses inside strings, such as "images:property_images(id)".
function balancedArgs(text, start) {
  let depth = 1, quote = null
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return text.slice(start, i)
  }
  return text.slice(start)
}

// The text with comments blanked out and every newline kept, so line numbers still match. A
// comment between `.from('properties')` and `.select(` must not hide the select from the scan.
// Comment characters become \u0001 (not a space) so a commented line is not mistaken for the
// blank line that ends a statement.
function stripComments(text) {
  const BLANK = '\u0001'
  let out = '', quote = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += n ?? ''; i++ } else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; continue }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') { out += BLANK; i++ }
      i--
      continue
    }
    if (c === '/' && n === '*') {
      out += BLANK + BLANK; i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { out += text[i] === '\n' ? '\n' : BLANK; i++ }
      out += BLANK + BLANK; i++
      continue
    }
    out += c
  }
  return out
}

// Every `.select(...)` that belongs to a `.from('properties')` call, with its line number.
function propertySelects(source) {
  const text = stripComments(source)
  const out = []
  const from = /\.from\(\s*['"]properties['"]\s*\)/g
  let m
  while ((m = from.exec(text))) {
    const after = text.slice(m.index + m[0].length)
    const end = after.search(/\.from\(|;|\n\s*\n/)
    const scope = end === -1 ? after : after.slice(0, end)
    const sel = /\.select\(/.exec(scope)
    if (!sel) continue
    const args = balancedArgs(scope, sel.index + sel[0].length)
    out.push({ args, line: text.slice(0, m.index).split('\n').length })
  }
  return out
}

function checkPropertyWildcards() {
  const offenders = []
  for (const scope of ['src', 'api']) {
    for (const file of walk(join(ROOT, scope), ['.js', '.jsx', '.mjs'])) {
      const rel = relative(ROOT, file)
      if (rel in PROPERTY_SERVICE_ROLE_FILES || rel.endsWith('.test.mjs')) continue
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const { args, line } of propertySelects(text)) {
        if (/^\s*$/.test(args)) offenders.push({ file: rel, line, what: 'select() with no columns returns every column of properties' })
        else if (/^\s*(['"`])\s*(\*|[^'"`]*,\s*\*)/.test(args)) offenders.push({ file: rel, line, what: "select('*') on properties" })
      }
      // An embedded `properties(*` returns every column of the parent row as well.
      const embed = /\bproperties(?:![\w_]+)?\(\s*\*/g
      let m
      while ((m = embed.exec(text))) {
        offenders.push({ file: rel, line: text.slice(0, m.index).split('\n').length, what: "embedded properties(*)" })
      }
    }
  }
  return offenders
}

// 8. `images` is not a column of properties. It belongs to student_hostels. Photos of a property
//    are rows of property_images, so a properties select must embed them
//    ("images:property_images(url, is_primary)"). Selecting a bare `images` makes the whole
//    query fail with "column does not exist", and the page shows an empty rail.
function checkPropertyImagesColumn() {
  const offenders = []
  for (const scope of ['src', 'api']) {
    for (const file of walk(join(ROOT, scope), ['.js', '.jsx', '.mjs'])) {
      const rel = relative(ROOT, file)
      if (rel.endsWith('.test.mjs')) continue
      const text = readFileSync(file, 'utf8')
      for (const { args, line } of propertySelects(text)) {
        // Only the top-level column list: drop anything inside nested parentheses.
        const top = args.replace(/\([^()]*\)/g, '')
        if (/(^|[\s,'"`])images\s*(?=,|['"`]|$)/.test(top)) offenders.push({ file: rel, line })
      }
    }
  }
  return offenders
}

// 9. A browser query may name only columns the database lets browsers read (BLOCKING). Migration
//    18 grants SELECT on the columns in PROPERTY_BROWSER_READABLE_COLUMNS and nothing else. A
//    select, an embed such as `properties(title)`, or a filter that names contact_phone,
//    payment_ref, assigned_agent_id or another private column is refused by the database, so the
//    page would show an error where it expected data. The two named lists in propertyColumns.js are
//    safe by construction (a test keeps them in line with the migration), so ${...} is not parsed.
function topLevelItems(list) {
  const items = []
  let depth = 0, cur = ''
  for (const c of list) {
    if (c === '(') depth++
    else if (c === ')') depth--
    if (c === ',' && depth === 0) { items.push(cur); cur = '' } else cur += c
  }
  items.push(cur)
  return items.map((s) => s.trim()).filter(Boolean)
}

// The column an item selects, or null for an embed (`profiles(full_name)`) or a wildcard.
function selectedColumn(item) {
  if (item.includes('(') || item === '*') return null
  const noCast = item.split('::')[0]
  const afterAlias = noCast.includes(':') ? noCast.slice(noCast.indexOf(':') + 1) : noCast
  return afterAlias.trim() || null
}

// The text of every `.from('properties')` chain, with its line number, whether or not it selects.
function propertyScopes(source) {
  const text = stripComments(source)
  const out = []
  const from = /\.from\(\s*['"]properties['"]\s*\)/g
  let m
  while ((m = from.exec(text))) {
    const after = text.slice(m.index + m[0].length)
    const end = after.search(/\.from\(|;|\n\s*\n/)
    out.push({ scope: end === -1 ? after : after.slice(0, end), line: text.slice(0, m.index).split('\n').length })
  }
  return out
}

function checkPropertyBrowserColumns() {
  const readable = new Set(PROPERTY_BROWSER_READABLE_COLUMNS)
  const offenders = []
  const flag = (file, line, name, where) => {
    if (name && !readable.has(name)) offenders.push({ file, line, what: `${where} ${name}${PROPERTY_PRIVATE_COLUMNS.includes(name) ? ' (private)' : ' (not granted in migration 18)'}` })
  }
  for (const scope of ['src', 'api']) {
    for (const file of walk(join(ROOT, scope), ['.js', '.jsx', '.mjs'])) {
      const rel = relative(ROOT, file)
      if (rel in PROPERTY_SERVICE_ROLE_FILES || rel.endsWith('.test.mjs')) continue
      const source = readFileSync(file, 'utf8')
      const text = stripComments(source)
      for (const { args, line } of propertySelects(source)) {
        const lit = /^\s*(['"`])([\s\S]*?)\1\s*(?:,|$)/.exec(args)
        if (!lit) continue
        const list = lit[2].replace(/\$\{[^}]*\}/g, '')
        for (const item of topLevelItems(list)) flag(rel, line, selectedColumn(item), 'selects')
      }
      // Filters and ordering on a property chain need the same privilege as a read.
      for (const { scope: chain, line } of propertyScopes(source)) {
        const filter = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*['"]([a-z_]+)['"]/g
        let f
        while ((f = filter.exec(chain))) flag(rel, line, f[1], 'filters or orders on')
      }
      // Embedded `properties(...)` inside another table's select.
      const embed = /\bproperties(?:![\w_]+)?\(/g
      let m
      while ((m = embed.exec(text))) {
        const line = text.slice(0, m.index).split('\n').length
        const inner = balancedArgs(text, m.index + m[0].length).replace(/\$\{[^}]*\}/g, '')
        for (const item of topLevelItems(inner)) flag(rel, line, selectedColumn(item), 'embeds')
      }
    }
  }
  return offenders
}

function main() {
  console.log('DealMatch Architecture Fitness Functions\n' + '='.repeat(42))

  if (process.argv.includes('--update-baseline')) {
    writeFileSync(BASELINE_PATH, JSON.stringify(dbCallsByFile(), null, 2) + '\n')
    console.log(`Baseline written to ${relative(ROOT, BASELINE_PATH)}`)
  }

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

  // 4. Adapter rule
  const rawFlw = checkGatewayAdapter()
  console.log('\n[4] Flutterwave calls only through the gateway adapter (BLOCKING)')
  if (rawFlw.length === 0) {
    console.log('    PASS: no raw Flutterwave paths outside src/lib/paymentGateway.js.')
  } else {
    failed = true
    console.log(`    FAIL: ${rawFlw.length} raw call(s):`)
    for (const v of rawFlw) console.log(`      ${v.file}:${v.line}`)
  }

  // 5. Factory rule
  const rawNotif = checkNotificationFactory()
  console.log('\n[5] Notification rows written only by the factory or the client facade (BLOCKING)')
  if (rawNotif.length === 0) {
    console.log('    PASS: no inline notification inserts.')
  } else {
    failed = true
    console.log(`    FAIL: ${rawNotif.length} inline insert(s):`)
    for (const v of rawNotif) console.log(`      ${v.file}`)
  }

  // 6. Repository ratchet
  const dbCounts = dbCallsByFile()
  const ratchet = checkDbRatchet(dbCounts)
  console.log('\n[6] Direct database calls may not grow (BLOCKING, ratchet)')
  console.log(`    ${ratchet.total} direct call(s) in ${ratchet.files} file(s); baseline ${ratchet.baseTotal}.`)
  if (ratchet.problems.length === 0) {
    console.log('    PASS: no file has grown.')
  } else {
    failed = true
    console.log(`    FAIL: ${ratchet.problems.length} file(s) grew:`)
    for (const p of ratchet.problems) console.log(`      ${p}`)
  }

  // 7. Property reads name their columns
  const wild = checkPropertyWildcards()
  console.log('\n[7] Property reads name their columns: no select(\'*\'), no empty select() (BLOCKING)')
  if (wild.length === 0) {
    console.log('    PASS: no wildcard property reads outside service-role files.')
  } else {
    failed = true
    console.log(`    FAIL: ${wild.length} wildcard read(s). Use PROPERTY_PUBLIC_COLUMNS (src/lib/propertyColumns.js):`)
    for (const v of wild) console.log(`      ${v.file}:${v.line} ${v.what}`)
  }

  // 8. No bare `images` column on properties
  const badImages = checkPropertyImagesColumn()
  console.log('\n[8] No bare `images` column selected from properties (BLOCKING)')
  if (badImages.length === 0) {
    console.log('    PASS: property photos are embedded from property_images.')
  } else {
    failed = true
    console.log(`    FAIL: ${badImages.length} read(s) select a column that does not exist. Embed images:property_images(url, is_primary):`)
    for (const v of badImages) console.log(`      ${v.file}:${v.line}`)
  }

  // 9. Browser queries name only readable property columns
  const privateReads = checkPropertyBrowserColumns()
  console.log('\n[9] Browser property queries name only columns browsers can read (BLOCKING)')
  if (privateReads.length === 0) {
    console.log('    PASS: no select, embed or filter names a private or ungranted property column.')
  } else {
    failed = true
    console.log(`    FAIL: ${privateReads.length} query part(s) the database would refuse (src/lib/propertyColumns.js, migration 18):`)
    for (const v of privateReads) console.log(`      ${v.file}:${v.line} ${v.what}`)
  }

  console.log('\n' + '='.repeat(42))
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
  process.exit(failed ? 1 : 0)
}

main()
