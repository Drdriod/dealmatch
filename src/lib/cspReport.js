// Decides which Content-Security-Policy violations are worth sending to Sentry, and sends each
// one at most once per page load. Before this, every blocked request became its own event, so a
// single visitor could file the same font or script violation many times in a few minutes, and
// browser extensions and the Cloudflare analytics beacon (blocked on purpose) buried real ones.

const EXTENSION_SCHEME = /^(chrome|moz|safari|ms-browser)-extension:/i

// Hosts the policy blocks on purpose. Reporting them can never lead to a fix.
// static.cloudflareinsights.com is Cloudflare's Web Analytics script, which Cloudflare injects
// into pages it proxies. We use PostHog, so the policy leaves it out.
const EXPECTED_BLOCKED_HOSTS = new Set(['static.cloudflareinsights.com'])

export function shouldReportCsp(violation) {
  const blocked = violation?.blockedURI || ''
  const source = violation?.sourceFile || ''
  if (EXTENSION_SCHEME.test(blocked) || EXTENSION_SCHEME.test(source)) return false
  try {
    if (EXPECTED_BLOCKED_HOSTS.has(new URL(blocked).hostname)) return false
  } catch { /* "inline", "eval" and "" are not URLs. They are still worth reporting. */ }
  return true
}

// Builds the function the page calls for each `securitypolicyviolation` event.
// `send` receives a Sentry event payload.
export function createCspReporter(send) {
  const seen = new Set()
  return function report(violation) {
    if (!shouldReportCsp(violation)) return false
    const directive = violation.effectiveDirective || violation.violatedDirective || 'unknown'
    const blocked = violation.blockedURI || '(none)'
    const key = `${directive}|${blocked}`
    if (seen.has(key)) return false
    seen.add(key)
    send({
      level: 'warning',
      message: `CSP Violation (${directive}): ${blocked}`,
      extra: {
        blockedURI: blocked,
        violatedDirective: violation.violatedDirective,
        effectiveDirective: violation.effectiveDirective,
        sourceFile: violation.sourceFile,
        documentURI: violation.documentURI,
      },
      tags: { security_event: 'csp_violation', csp_directive: directive },
    })
    return true
  }
}
