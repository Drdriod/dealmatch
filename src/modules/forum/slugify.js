/**
 * URL-safe slug generator, shared by anything that creates forum threads or
 * needs to reconstruct/validate a slug (the SSR renderer, the API, tests).
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
}

/** Appends a short random suffix — used when a slug collides within a category. */
export function slugWithSuffix(text) {
  const base = slugify(text)
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base}-${suffix}`
}
