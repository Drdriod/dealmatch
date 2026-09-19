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
