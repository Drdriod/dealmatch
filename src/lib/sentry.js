/**
 * Error tracking helpers.
 *
 * The Sentry SDK is large, so it is loaded after the first page is on screen instead of in the
 * first download (startMonitoring, called from main.jsx). Every helper here works at any time:
 * the first call that needs the SDK loads it, so an error that happens before it is ready is still
 * reported. Without VITE_SENTRY_DSN nothing is loaded or sent.
 */

let loading = null

function load() {
  if (!import.meta.env.VITE_SENTRY_DSN) return Promise.resolve(null)
  if (!loading) {
    loading = import('./sentryInit.js').then((m) => m.initSentry()).catch(() => null)
  }
  return loading
}

// Runs fn with the SDK once it is loaded. Never throws, never blocks the caller.
function withSentry(fn) {
  load().then((Sentry) => { if (Sentry) { try { fn(Sentry) } catch { /* monitoring must never break the app */ } } })
}

// Called once after React has mounted. Waits for the browser to be idle (or 2 seconds at most).
export function startMonitoring() {
  if (!import.meta.env.VITE_SENTRY_DSN || typeof window === 'undefined') return
  const go = () => { load() }
  const ric = window.requestIdleCallback
  if (document.readyState === 'complete') (ric ? ric(go, { timeout: 2000 }) : setTimeout(go, 1500))
  else window.addEventListener('load', () => (ric ? ric(go, { timeout: 2000 }) : setTimeout(go, 1500)), { once: true })
}

export const captureError = (error, context = {}) => {
  console.error(error)
  withSentry((Sentry) => Sentry.captureException(error, { extra: context }))
}

// A render crash caught by the app's error boundary. Sent as a real exception (so the Sentry
// title shows the actual error and similar crashes group together), with the React component
// stack attached.
export const captureRenderError = (error, componentStack) => {
  withSentry((Sentry) => Sentry.captureException(error, {
    tags: { boundary: 'app' },
    contexts: { react: { componentStack: String(componentStack || '').slice(0, 2000) } },
  }))
}

export const captureMessage = (msg, level = 'info') => {
  withSentry((Sentry) => Sentry.captureMessage(msg, level))
}

// A prepared event (used by the Content-Security-Policy reporter).
export const captureEvent = (payload) => {
  withSentry((Sentry) => Sentry.captureEvent(payload))
}

// Security signals from the browser (for example DevTools opened).
export const captureSecurityEvent = (event, meta) => {
  withSentry((Sentry) => Sentry.captureEvent({
    level: 'warning',
    message: `[DealMatch Security] ${event}`,
    extra: meta,
    tags: { security_event: event },
  }))
}

// Only the account id is sent. The email is personal data and is not needed to find the person
// from an error: the id is enough to look the account up.
export const setUser = (user) => {
  withSentry((Sentry) => Sentry.setUser(user ? { id: user.id } : null))
}

export const addBreadcrumb = (message, data = {}) => {
  withSentry((Sentry) => Sentry.addBreadcrumb({ message, data, timestamp: Date.now() / 1000 }))
}
