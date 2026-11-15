// Saves what someone has typed into a form on their own device, so a dropped
// connection, a reload or a closed tab never makes them start again.
//
// Stored only in this browser (localStorage), under their user id, for 7 days.
// Files and photo previews cannot be stored, so those are left out and the
// person re-adds the photos. Everything is cleared on sign-out and after a
// successful submit. Every read and write is wrapped: private windows and full
// storage must never break a form.

const PREFIX = 'dm-draft:v1:'
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const draftKey = (name, userId) => `${PREFIX}${userId || 'guest'}:${name}`

// Drops anything that cannot or should not be stored: files, blobs, blob:/data: URLs
// and any field listed in `omit` (passwords and the like).
export function sanitizeDraft(value, omit = []) {
  const walk = (v) => {
    if (v == null) return v
    if (typeof File !== 'undefined' && v instanceof File) return undefined
    if (typeof Blob !== 'undefined' && v instanceof Blob) return undefined
    if (typeof v === 'string') return /^(blob:|data:)/i.test(v) ? undefined : v
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== undefined)
    if (typeof v === 'object') {
      const out = {}
      for (const [k, x] of Object.entries(v)) {
        if (omit.includes(k)) continue
        const w = walk(x)
        if (w !== undefined) out[k] = w
      }
      return out
    }
    return v
  }
  return walk(value)
}

export function readDraft(key, ttlMs = DRAFT_TTL_MS, now = Date.now()) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.savedAt !== 'number' || now - parsed.savedAt > ttlMs) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeDraft(key, data, now = Date.now()) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: now, data }))
    return true
  } catch {
    return false
  }
}

export function removeDraft(key) {
  try { localStorage.removeItem(key) } catch { /* nothing to remove */ }
}

export function clearAllDrafts() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch { /* storage unavailable */ }
}
