/**
 * Sentry error tracking helpers
 * Wraps @sentry/react for clean usage across the app
 */
import * as Sentry from '@sentry/react'

export const captureError = (error, context = {}) => {
  console.error(error)
  try {
    Sentry.captureException(error, { extra: context })
  } catch {}
}

// A render crash caught by the app's error boundary. Sent as a real exception (so the Sentry
// title shows the actual error and similar crashes group together), with the React component
// stack attached. Previously these went out as a generic "[DealMatch Security] render_error".
export const captureRenderError = (error, componentStack) => {
  try {
    Sentry.captureException(error, {
      tags: { boundary: 'app' },
      contexts: { react: { componentStack: String(componentStack || '').slice(0, 2000) } },
    })
  } catch {}
}

export const captureMessage = (msg, level = 'info') => {
  try {
    Sentry.captureMessage(msg, level)
  } catch {}
}

export const setUser = (user) => {
  try {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email })
    } else {
      Sentry.setUser(null)
    }
  } catch {}
}

export const addBreadcrumb = (message, data = {}) => {
  try {
    Sentry.addBreadcrumb({ message, data, timestamp: Date.now() / 1000 })
  } catch {}
}
