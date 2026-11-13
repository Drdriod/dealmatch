// Live-site probe: security headers and harmless "attack" requests against the public site.
// Usage: node scripts/live-probe.mjs https://www.dealmatch.com.ng
// Nothing here changes data. Every request is a GET, an OPTIONS, or a POST with no credentials that the
// server must refuse. Exits 1 if any check FAILs. WARN is advice, INFO is a note.
import { writeFileSync, appendFileSync } from 'node:fs'

const site = (process.argv[2] || 'https://www.dealmatch.com.ng').replace(/\/$/, '')
const rows = []
const add = (level, name, detail = '') => { rows.push({ level, name, detail }); console.log(`${level.padEnd(4)} ${name}${detail ? ' — ' + detail : ''}`) }
const pass = (n, d) => add('PASS', n, d)
const fail = (n, d) => add('FAIL', n, d)
const warn = (n, d) => add('WARN', n, d)
const info = (n, d) => add('INFO', n, d)
const check = (ok, name, detail) => (ok ? pass(name) : fail(name, detail))

async function get(path, opts = {}) {
  return fetch(site + path, { redirect: 'manual', ...opts })
}

// ── 1. HTTPS ─────────────────────────────────────────────────────────────────
try {
  const r = await fetch(site.replace('https://', 'http://') + '/', { redirect: 'manual' })
  const loc = r.headers.get('location') || ''
  check([301, 302, 307, 308].includes(r.status) && loc.startsWith('https://'), 'HTTP redirects to HTTPS', `status ${r.status} location ${loc}`)
} catch (e) { warn('HTTP to HTTPS redirect could not be tested', e.message) }

// ── 2. Headers on the home page and on an unknown route ──────────────────────
for (const path of ['/', '/this-page-does-not-exist']) {
  const r = await get(path)
  const h = (k) => r.headers.get(k) || ''
  const p = path === '/' ? 'home' : 'unknown route'
  const hsts = /max-age=(\d+)/.exec(h('strict-transport-security'))
  check(hsts && Number(hsts[1]) >= 15552000, `HSTS present (${p})`, h('strict-transport-security') || 'missing')
  check(/nosniff/i.test(h('x-content-type-options')), `X-Content-Type-Options nosniff (${p})`, h('x-content-type-options') || 'missing')
  check(/deny|sameorigin/i.test(h('x-frame-options')), `X-Frame-Options (${p})`, h('x-frame-options') || 'missing')
  check(!!h('referrer-policy'), `Referrer-Policy (${p})`, 'missing')
  check(!!h('permissions-policy'), `Permissions-Policy (${p})`, 'missing')
  const csp = h('content-security-policy')
  check(!!csp, `Content-Security-Policy present (${p})`, 'missing')
  if (csp && path === '/') {
    const script = (/script-src([^;]*)/.exec(csp) || [])[1] || ''
    check(!/unsafe-eval/.test(script), 'CSP script-src has no unsafe-eval', script)
    check(!/unsafe-inline/.test(script), 'CSP script-src has no unsafe-inline', script)
    check(/object-src\s+'none'/.test(csp), "CSP object-src 'none'", csp)
    check(/frame-ancestors/.test(csp), 'CSP frame-ancestors set', 'missing')
    check(/base-uri/.test(csp), 'CSP base-uri set', 'missing')
    check(!/\sdata:[^;]*script|\*\s*;/.test((/script-src[^;]*/.exec(csp) || [''])[0]), 'CSP script-src is not a wildcard', csp)
  }
  check(!h('x-powered-by'), `No X-Powered-By leak (${p})`, h('x-powered-by'))
  if (h('x-xss-protection')) check(h('x-xss-protection').startsWith('0'), `X-XSS-Protection disabled (${p})`, h('x-xss-protection'))
  if (path === '/') info('Server header', h('server') || 'none')
}

// ── 3. Cookies on the home page ──────────────────────────────────────────────
{
  const r = await get('/')
  const cookies = r.headers.getSetCookie?.() || []
  if (!cookies.length) pass('No cookies set on the home page')
  else for (const c of cookies) check(/;\s*secure/i.test(c) && /;\s*httponly/i.test(c), 'Cookie has Secure and HttpOnly', c.split('=')[0])
}

// ── 4. Files that must not be public ─────────────────────────────────────────
for (const path of ['/.env', '/.git/config', '/package.json', '/supabase/config.toml', '/.github/workflows/check.yml', '/node_modules/.package-lock.json', '/..%2f..%2fetc%2fpasswd']) {
  try {
    const r = await get(path)
    const body = r.status === 200 ? await r.text() : ''
    const isShell = /<div id="root"|<!doctype html/i.test(body)
    const leaks = !isShell && body.length > 0 && r.status === 200
    check(!leaks && !/SERVICE_ROLE|\[core\]|root:x:/.test(body), `Not exposed: ${path}`, `status ${r.status}`)
  } catch (e) { warn(`Could not test ${path}`, e.message) }
}

// ── 5. JavaScript bundle: secrets and source maps ────────────────────────────
try {
  const html = await (await get('/')).text()
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]).slice(0, 6)
  const jwtRe = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
  let secretHits = 0, maps = 0, checked = 0
  for (const s of scripts) {
    const url = s.startsWith('http') ? s : site + (s.startsWith('/') ? s : '/' + s)
    const js = await (await fetch(url)).text(); checked++
    if (/sk_live_|FLWSECK|service_role|SUPABASE_SERVICE_ROLE|re_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(js)) secretHits++
    for (const j of js.match(jwtRe) || []) {
      try { if (JSON.parse(Buffer.from(j.split('.')[1], 'base64url').toString()).role === 'service_role') secretHits++ } catch { /* not a JWT */ }
    }
    if (/sourceMappingURL=/.test(js.slice(-300))) {
      const m = await fetch(url + '.map'); if (m.ok && !/<html/i.test(await m.text())) maps++
    }
  }
  check(secretHits === 0, `No secrets in the main JavaScript files (${checked} checked)`, `${secretHits} suspicious match(es)`)
  maps ? warn('Source maps are public', `${maps} file(s): readable source code for anyone`) : pass('No public source maps')
} catch (e) { warn('Bundle scan could not run', e.message) }

// ── 6. Reflection of script text ─────────────────────────────────────────────
{
  const payload = '"><script>alert(1)</script>'
  const r = await get('/search?q=' + encodeURIComponent(payload))
  const body = await r.text()
  check(!body.includes(payload), 'Script text in the address is not reflected into the page', 'payload came back unescaped')
}

// ── 7. API endpoints must refuse unauthenticated callers ─────────────────────
const apiCases = [
  ['POST', '/api/send-email', { userId: 'x', subject: 'x', message: 'x' }, [401, 403]],
  ['POST', '/api/send-whatsapp', { userId: 'x', message: 'x' }, [401, 403]],
  ['POST', '/api/index-property', { property: { id: 'x' } }, [401, 403]],
  ['POST', '/api/agent/start', {}, [401, 403]],
  ['GET', '/api/admin/people', null, [401, 403, 405]],
  ['POST', '/api/flutterwave-webhook', { type: 'charge.completed', data: { id: '1' } }, [400, 401, 403]],
  ['POST', '/api/escrow-webhook', { event: 'escrow.funded', data: { reference: 'x' } }, [400, 401, 403, 500]],
]
for (const [method, path, body, ok] of apiCases) {
  try {
    const r = await get(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = (await r.text()).slice(0, 120)
    const okStatus = ok.includes(r.status) || r.status === 404 // 404 = no such route on this deployment
    check(okStatus, `${method} ${path} refuses an unauthenticated caller`, `status ${r.status} ${text}`)
    if (/stack|at \w+ \(|node_modules|SUPABASE|secret/i.test(text)) fail(`${path} leaks internals in its error`, text)
  } catch (e) { warn(`${path} could not be tested`, e.message) }
}

// ── 8. CORS: a foreign origin must not be allowed ────────────────────────────
for (const path of ['/api/send-email', '/api/send-whatsapp']) {
  try {
    const r = await get(path, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } })
    const allow = r.headers.get('access-control-allow-origin') || ''
    check(allow !== '*' && !allow.includes('evil.example'), `CORS refuses a foreign origin (${path})`, `allow-origin: ${allow}`)
  } catch (e) { warn(`CORS on ${path} could not be tested`, e.message) }
}

// ── 9. Rate limit really triggers (20 quick calls to a limited endpoint) ─────
try {
  const codes = []
  for (let i = 0; i < 20; i++) {
    const r = await get('/api/send-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    codes.push(r.status)
  }
  codes.includes(429) ? pass('Rate limit answers 429 under rapid calls', `codes: ${[...new Set(codes)].join(',')}`) : warn('No 429 seen in 20 rapid calls to /api/send-email', `codes: ${[...new Set(codes)].join(',')}`)
} catch (e) { warn('Rate-limit probe could not run', e.message) }

// ── 10. Housekeeping files ───────────────────────────────────────────────────
{
  const r = await get('/.well-known/security.txt'); const body = r.status === 200 ? await r.text() : '';
  ;/Contact:/i.test(body) ? pass('security.txt published') : info('No security.txt', 'optional: lets researchers report problems to you')
}

// ── Summary ──────────────────────────────────────────────────────────────────
const count = (l) => rows.filter((r) => r.level === l).length
const md = [`## Live probe of ${site}`, '', `PASS ${count('PASS')} · FAIL ${count('FAIL')} · WARN ${count('WARN')} · INFO ${count('INFO')}`, '',
  '| Result | Check | Detail |', '|---|---|---|', ...rows.map((r) => `| ${r.level} | ${r.name} | ${String(r.detail).replace(/\|/g, '/').slice(0, 160)} |`)].join('\n')
writeFileSync('live-probe-report.md', md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
console.log(`\nPASS ${count('PASS')} FAIL ${count('FAIL')} WARN ${count('WARN')}`)
process.exit(count('FAIL') ? 1 : 0)
