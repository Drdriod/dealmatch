// Run with: node --test src/lib/cspReport.test.mjs
// Cases come from the October 2026 Sentry export: Google Fonts, Cloudflare beacon, manifest.json.
import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldReportCsp, createCspReporter } from './cspReport.js'

const fonts = { blockedURI: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap', effectiveDirective: 'style-src-elem', violatedDirective: 'style-src-elem' }
const beacon = { blockedURI: 'https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495', effectiveDirective: 'script-src-elem' }
const manifest = { blockedURI: 'https://dealmatch-yvdm-git-main-drdriods-projects.vercel.app/manifest.json', effectiveDirective: 'manifest-src' }

test('real violations are reported', () => {
  assert.equal(shouldReportCsp(fonts), true)
  assert.equal(shouldReportCsp(manifest), true)
  assert.equal(shouldReportCsp({ blockedURI: 'inline', effectiveDirective: 'script-src-elem' }), true)
  assert.equal(shouldReportCsp({ blockedURI: 'eval', effectiveDirective: 'script-src' }), true)
})

test('the Cloudflare analytics beacon is blocked on purpose and not reported', () => {
  assert.equal(shouldReportCsp(beacon), false)
})

test('browser extensions are not reported', () => {
  assert.equal(shouldReportCsp({ blockedURI: 'chrome-extension://abc/inject.js' }), false)
  assert.equal(shouldReportCsp({ blockedURI: 'inline', sourceFile: 'moz-extension://abc/content.js' }), false)
})

test('each directive and URL pair is sent once per page load', () => {
  const sent = []
  const report = createCspReporter(e => sent.push(e))
  assert.equal(report(fonts), true)
  assert.equal(report(fonts), false)
  assert.equal(report(fonts), false)
  assert.equal(report({ ...fonts, effectiveDirective: 'font-src' }), true)
  assert.equal(report(beacon), false)
  assert.equal(sent.length, 2)
})

test('the event title names the directive so the list is readable', () => {
  const sent = []
  createCspReporter(e => sent.push(e))(manifest)
  assert.equal(sent[0].message, `CSP Violation (manifest-src): ${manifest.blockedURI}`)
  assert.equal(sent[0].tags.security_event, 'csp_violation')
  assert.equal(sent[0].tags.csp_directive, 'manifest-src')
  assert.equal(sent[0].extra.blockedURI, manifest.blockedURI)
})
