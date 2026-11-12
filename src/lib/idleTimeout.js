// Idle sign-out for staff sessions (audit F-024). Pure decision logic, so it can be tested without a
// browser: given when the person last did something and what time it is now, say whether they are
// still active, should be warned, or have been idle too long.
export const STAFF_IDLE_LIMIT_MS = 20 * 60 * 1000   // signed out after 20 minutes without activity
export const STAFF_IDLE_WARN_MS  = 60 * 1000        // a one-minute warning before that

export function idleState(lastActivityMs, nowMs, limitMs = STAFF_IDLE_LIMIT_MS, warnMs = STAFF_IDLE_WARN_MS) {
  const idle = nowMs - lastActivityMs
  if (idle >= limitMs) return { state: 'expired', secondsLeft: 0 }
  if (idle >= limitMs - warnMs) return { state: 'warning', secondsLeft: Math.ceil((limitMs - idle) / 1000) }
  return { state: 'active', secondsLeft: Math.ceil((limitMs - idle) / 1000) }
}
