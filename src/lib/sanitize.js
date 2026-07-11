// Input sanitization: prevents XSS and injection attacks

// Strip HTML tags and dangerous characters from text input
export const sanitizeText = (str) => {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/[<>]/g, '')           // Remove HTML tags
    .replace(/javascript:/gi, '')   // Remove JS protocol
    .replace(/on\w+=/gi, '')        // Remove event handlers
    .trim()
    .substring(0, 1000)             // Max 1000 chars
}

// Sanitize phone numbers: digits, +, spaces, dashes only
export const sanitizePhone = (str) => {
  if (!str || typeof str !== 'string') return ''
  return str.replace(/[^\d+\s\-()]/g, '').substring(0, 20)
}

// Sanitize email
export const sanitizeEmail = (str) => {
  if (!str || typeof str !== 'string') return ''
  return str.toLowerCase().trim().substring(0, 254)
}

// Sanitize number input
export const sanitizeNumber = (val, min = 0, max = 999999999) => {
  const n = Number(val)
  if (isNaN(n)) return 0
  return Math.min(max, Math.max(min, n))
}

// Sanitize URLs: only allow http/https
export const sanitizeUrl = (str) => {
  if (!str || typeof str !== 'string') return ''
  try {
    const u = new URL(str)
    if (!['http:', 'https:'].includes(u.protocol)) return ''
    return str.substring(0, 2048)
  } catch {
    return ''
  }
}

// Sanitize filenames: allow alphanumeric, dots, dashes, underscores
export const sanitizeFilename = (str) => {
  if (!str || typeof str !== 'string') return ''
  return str.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255)
}

// Sanitize an entire form object
export const sanitizeForm = (form) => {
  const result = {}
  for (const [key, value] of Object.entries(form)) {
    if (typeof value === 'string') {
      if (key.includes('email')) result[key] = sanitizeEmail(value)
      else if (key.includes('phone')) result[key] = sanitizePhone(value)
      else if (key.includes('url') || key.includes('video')) result[key] = sanitizeUrl(value)
      else result[key] = sanitizeText(value)
    } else if (typeof value === 'number') {
      result[key] = sanitizeNumber(value)
    } else {
      result[key] = value
    }
  }
  return result
}
