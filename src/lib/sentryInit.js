/**
 * Sentry start-up, loaded after the first page is on screen (see lib/sentry.js and main.jsx).
 * Keeping the SDK out of the first download makes the first load faster; errors that happen
 * before it is ready still reach it, because the first error loads it on demand.
 */
import * as Sentry from '@sentry/react'

let started = false

export function initSentry() {
  if (started) return Sentry
  started = true
  if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    // Vercel preview deployments are built in production mode too. Tag them so they can be filtered
    // out of the production error feed.
    environment: window.location.hostname.endsWith('.vercel.app') ? 'preview' : import.meta.env.MODE,
    release: 'dealmatch@1.4.0',

    // Only send a sample of performance traces - reduces cost
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // ── PII Scrubbing ──────────────────────────────────────────
    // NEVER send passwords, tokens, or personal data to Sentry.
    // These patterns are scrubbed from all events before transmission.
    beforeSend(event) {
      // Strip request bodies entirely - they may contain passwords
      if (event.request?.data) {
        event.request.data = '[Scrubbed]'
      }

      // Remove sensitive query params from URLs
      if (event.request?.url) {
        event.request.url = event.request.url
          .replace(/([?&])(password|token|secret|key|auth)[^&]*/gi, '$1[Scrubbed]')
      }

      // Strip cookies
      if (event.request?.cookies) {
        event.request.cookies = '[Scrubbed]'
      }

      // Strip auth headers
      if (event.request?.headers) {
        const h = { ...event.request.headers }
        delete h['Authorization']
        delete h['Cookie']
        delete h['Set-Cookie']
        event.request.headers = h
      }

      // Don't send events in development unless explicitly testing
      if (import.meta.env.DEV && !import.meta.env.VITE_SENTRY_DEBUG) {
        return null
      }

      return event
    },

    // Ignore known harmless errors that would pollute the feed
    ignoreErrors: [
      // Browser extension interference
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network errors outside our control
      'Network request failed',
      'Failed to fetch',
      'NetworkError',
      'Load failed',
      // Safari-specific quirks
      'Non-Error promise rejection captured',
      // Flutterwave iframe cross-origin
      'Permission denied to access property',
    ],

    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  })

  }
  return Sentry
}

export { Sentry }
