// Pure shaping for the user dashboard, moved out of the page so it can be tested.

export const SPARK_WEEKS = 8
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Buckets created_at timestamps into weekly counts, oldest week first. A row older than
// `weeks` weeks, or dated in the future, is not counted.
export function weeklyCounts(rows, now = Date.now(), weeks = SPARK_WEEKS) {
  const buckets = new Array(weeks).fill(0)
  for (const r of rows || []) {
    const age = now - new Date(r.created_at).getTime()
    const idx = weeks - 1 - Math.floor(age / WEEK_MS)
    if (idx >= 0 && idx < weeks) buckets[idx] += 1
  }
  return buckets
}

// The "Recent activity" feed: the person's listings (properties and category listings) and
// requests, newest first, at most `limit`.
export function buildActivity({ properties = [], categoryListings = [], requests = [] }, limit = 6) {
  const listingActivity = [
    ...properties.map((p) => ({
      kind: 'listing', id: p.id, title: p.title,
      sub: `₦${Number(p.price).toLocaleString()} · ${p.category}`,
      status: p.status, at: p.created_at, link: `/property/${p.id}`,
    })),
    ...categoryListings.map((l) => ({
      kind: 'listing', id: l.id, title: l.title, sub: l.type,
      status: l.status, at: l.created_at, link: null,
    })),
  ]
  const requestActivity = requests.map((r) => ({
    kind: 'request', id: r.request_id, title: r.title, sub: r.request_type,
    status: r.status, at: r.created_at, link: null,
  }))
  return [...listingActivity, ...requestActivity]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit)
}
