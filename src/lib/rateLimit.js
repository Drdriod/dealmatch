// Client-side rate limiting: prevents spam submissions

const attempts = {}

export const rateLimit = (key, maxAttempts = 5, windowMs = 60000) => {
  const now    = Date.now()
  const record = attempts[key] || { count: 0, resetAt: now + windowMs }

  // Reset window if expired
  if (now > record.resetAt) {
    attempts[key] = { count: 1, resetAt: now + windowMs }
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  record.count++
  attempts[key] = record

  if (record.count > maxAttempts) {
    const waitSec = Math.ceil((record.resetAt - now) / 1000)
    return {
      allowed:   false,
      remaining: 0,
      message:   `Too many attempts. Please wait ${waitSec} seconds.`,
    }
  }

  return { allowed: true, remaining: maxAttempts - record.count }
}

// Clear rate limit for a key (e.g. after successful action)
export const clearRateLimit = (key) => {
  delete attempts[key]
}
