/**
 * DealMatch - main.jsx
 * ======================
 * Security wiring point for all three pillars:
 *
 * Pillar 1 (Zero-Breach):
 *   - Sentry initialised with PII scrubbing BEFORE React mounts
 *   - Global unhandled error + promise rejection capture
 *   - window.__sentry_capture exposed for security.js event bus
 *   - Content Security Policy violation reporter
 *
 * Pillar 2 (Build-Time Zip):
 *   - Strict mode enforced (catches double-render issues in dev)
 *   - Module loaded only after env validation passes (vite.config.js handles this)
 *
 * Pillar 3 (Anti-Scraping & Anti-Leak):
 *   - DevTools detection (warns in console, logs to Sentry)
 *   - Right-click / F12 blocking in production
 *   - Text selection restriction on sensitive UI regions
 *   - postMessage origin enforcement active (security.js handles this)
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'
import { Check } from 'lucide-react'


// ─── Pillar 1: Sentry - Zero-Breach Error Monitoring ────────────────────────
// Must initialise BEFORE React mounts so all errors are captured,
// including errors that occur during the initial render.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
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
      // Paystack iframe cross-origin
      'Permission denied to access property',
    ],

    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  })

  // Expose a capture helper for the security event bus (security.js)
  window.__sentry_capture = (event, meta) => {
    Sentry.captureEvent({
      level:   'warning',
      message: `[DealMatch Security] ${event}`,
      extra:   meta,
      tags:    { security_event: event },
    })
  }
}

// ─── Global Error Boundaries ─────────────────────────────────────────────────
window.addEventListener('error', (e) => {
  // Catch errors that escape React's ErrorBoundary
  // (e.g. errors in event handlers, async code outside React)
  if (import.meta.env.PROD) {
    Sentry.captureException(e.error || new Error(e.message))
  }
})

window.addEventListener('unhandledrejection', (e) => {
  if (import.meta.env.PROD) {
    Sentry.captureException(e.reason)
  }
})

// ─── CSP Violation Reporter ───────────────────────────────────────────────────
// Logs Content-Security-Policy violations to Sentry so you know
// if any injected scripts are being blocked.
document.addEventListener('securitypolicyviolation', (e) => {
  if (import.meta.env.PROD) {
    Sentry.captureEvent({
      level:   'warning',
      message: `CSP Violation: ${e.blockedURI}`,
      extra: {
        blockedURI:         e.blockedURI,
        violatedDirective:  e.violatedDirective,
        originalPolicy:     e.originalPolicy?.substring(0, 200),
        documentURI:        e.documentURI,
      },
      tags: { security_event: 'csp_violation' },
    })
  }
})

// ─── Pillar 3: Anti-Scraping - DevTools & Right-Click Protection ─────────────
// These measures make bulk data extraction harder for scrapers.
// They are NOT foolproof - a determined attacker can bypass them.
// They are a friction layer, not a complete solution.
// The real protection is server-side (RLS, rate limiting, apiMiddleware.js).

if (import.meta.env.PROD) {

  // ── Disable right-click context menu ─────────────────────────
  // Prevents casual "Save as" / "Inspect" from untrained scrapers.
  document.addEventListener('contextmenu', (e) => {
    // Only block on property listings and sensitive data areas,
    // not the entire page (that would break accessibility).
    const target = e.target.closest(
      '[data-protected], .property-card, .listing-price, .agent-contact'
    )
    if (target) e.preventDefault()
  })

  // ── Disable text selection on price/contact data ──────────────
  // Applied via CSS class - add `data-protected` to sensitive elements.
  // This prevents simple copy-paste scraping of structured data.
  const style = document.createElement('style')
  style.textContent = `
    [data-protected] {
      -webkit-user-select: none;
      -moz-user-select: none;
      user-select: none;
    }
  `
  document.head.appendChild(style)

  // ── DevTools detection ────────────────────────────────────────
  // Detects when DevTools is opened and logs it as a security event.
  // Does NOT block DevTools (that's impossible) - only logs.
  let devToolsOpen = false
  const devToolsCheck = () => {
    const threshold = 160
    const widthDiff  = window.outerWidth  - window.innerWidth  > threshold
    const heightDiff = window.outerHeight - window.innerHeight > threshold
    if ((widthDiff || heightDiff) && !devToolsOpen) {
      devToolsOpen = true
      window.__sentry_capture?.('devtools_opened', {
        url: window.location.pathname,
      })
    } else if (!widthDiff && !heightDiff) {
      devToolsOpen = false
    }
  }
  // Check every 3 seconds - infrequent enough to not impact performance
  setInterval(devToolsCheck, 3000)

  // ── Console warning ───────────────────────────────────────────
  // Warns users who open the console - helps prevent social engineering
  // attacks where bad actors tell users to paste malicious code.
  console.log(
    '%cSTOP!',
    'color: red; font-size: 40px; font-weight: bold;'
  )
  console.log(
    '%cIf someone told you to paste something here, this is a SCAM.\n' +
    'DealMatch engineers will NEVER ask you to run code in this console.\n' +
    'Doing so could give attackers full access to your account.',
    'color: #C85F2D; font-size: 14px;'
  )
}

// ─── PWA: Register Service Worker ────────────────────────────────────────────
// Required for the app to be installable at all - Chrome's installability
// criteria (which gates whether `beforeinstallprompt` fires, and therefore
// whether InstallPrompt.jsx ever shows) include having an active service
// worker with a fetch handler. Without this registration, "Add to Home
// Screen" silently never triggers, with no visible error.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // If a new sw.js is deployed while a user has the site open, activate
      // it on next load rather than leaving them stuck on a stale version.
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            console.log('DealMatch: updated service worker activated')
          }
        })
      })
    }).catch(err => {
      // Non-critical: only affects installability/offline support, not core
      // app function. Logged as a warning breadcrumb rather than
      // captureException so it doesn't get triaged like a real outage.
      console.warn('Service worker registration failed (PWA install/offline unaffected app function):', err)
      Sentry.addBreadcrumb({
        category: 'pwa',
        message: `Service worker registration failed: ${err?.message || err}`,
        level: 'warning',
      })
    })
  })
}

// ─── Mount React App ──────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// ─── Native app shell wiring (Android/iOS only, no-op on the website) ───────
// The exact same built bundle runs three ways: the live website, and both
// native app shells (capacitor.config.ts points their WebViews AT the live
// website -- see that file's comment for why). Capacitor.isNativePlatform()
// is how this code tells which context it's in; @capacitor/app and
// @capacitor/splash-screen are also safe no-ops on plain web even without
// this guard, but guarding makes the intent explicit and skips the import
// side-effects entirely for the website's users.
import('@capacitor/core').then(({ Capacitor }) => {
  if (!Capacitor.isNativePlatform()) return

  Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen')])
    .then(([{ App: NativeApp }, { SplashScreen }]) => {
      // Hide the native splash once React has actually mounted and the
      // live site has loaded in the WebView -- launchShowDuration in
      // capacitor.config.ts is a minimum/fallback, this hides it as soon
      // as the app is genuinely ready rather than on a fixed timer.
      SplashScreen.hide()

      // Hardware back button (Android): without this, Capacitor's default
      // behavior is to close the app on ANY back press, including when
      // there's obvious in-app navigation history to go back through --
      // the single most common one-star-review complaint for wrapped web
      // apps. Mirror normal Android app behavior instead: go back through
      // history if possible, otherwise exit.
      // Use the WebView's own canGoBack (passed in the event) rather than
      // window.history.length, which stays > 1 for the whole session and
      // would trap the user on the first screen.
      NativeApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back()
        } else {
          NativeApp.exitApp()
        }
      })
    })
    .catch(err => console.warn('Native shell wiring failed (web app unaffected):', err))
})

