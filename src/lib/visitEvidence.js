// Evidence rules for an agent's site visit (used by api/agent/[action].js).
// Kept free of network and database code so it can be tested on its own.
//
// Two checks that a dishonest agent cannot fake from their own phone:
//  A. A visit code. The server derives a 6-digit code from a secret the agent never
//     sees. Only the property owner can ask for it (in My Offers) and they give it to
//     the agent in person. The agent must type it when submitting.
//  B. Photo evidence. Each photo must sit in the agent's own folder for this property,
//     and where the photo carries a GPS tag it must be near the property.
import crypto from 'crypto'

export const MAX_PHOTO_DISTANCE_M = 250
export const MAX_PHOTOS_CHECKED = 8

export function visitCodeFor(sessionId, masterSecret) {
  const digest = crypto.createHmac('sha256', masterSecret).update(`visit-code:${sessionId}`).digest()
  const n = digest.readUInt32BE(0) % 1000000
  return String(n).padStart(6, '0')
}

export function visitCodeMatches(sessionId, masterSecret, submitted) {
  const given = String(submitted ?? '').replace(/\D/g, '')
  if (given.length !== 6) return false
  const expected = visitCodeFor(sessionId, masterSecret)
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}

// Photo paths must look like `<agentId>/<propertyId>/<file>`: the agent's own upload folder.
export function photoPathsAreOwn(photos, agentId, propertyId) {
  const prefix = `${agentId}/${propertyId}/`
  return Array.isArray(photos) && photos.length > 0 &&
    photos.every(p => typeof p === 'string' && p.startsWith(prefix) && !p.includes('..'))
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// `tags` is one entry per photo: { latitude, longitude, takenAt } with missing fields null,
// or null when the photo could not be read at all.
// Returns { reject, reason, checks }. A far-away GPS tag rejects the visit. Missing tags
// never reject (phones and browsers often strip them) but are recorded for the reviewer.
export function evaluatePhotoEvidence(tags, property, session) {
  const checks = { photos: tags.length, with_gps: 0, without_gps: 0, unreadable: 0, max_distance_m: null, taken_before_visit: 0 }
  const startedAt = new Date(session.server_t0).getTime()
  let worst = null
  for (const t of tags) {
    if (!t) { checks.unreadable += 1; continue }
    if (t.latitude == null || t.longitude == null) checks.without_gps += 1
    else {
      checks.with_gps += 1
      const d = Math.round(distanceMeters(t.latitude, t.longitude, property.latitude, property.longitude))
      if (worst == null || d > worst) worst = d
    }
    // Camera clocks carry no reliable zone, so allow a full day of slack before noting it.
    if (t.takenAt && new Date(t.takenAt).getTime() < startedAt - 24 * 3600 * 1000) checks.taken_before_visit += 1
  }
  checks.max_distance_m = worst
  if (worst != null && worst > MAX_PHOTO_DISTANCE_M) {
    return { reject: true, reason: `A photo was taken ${worst}m from the property (max ${MAX_PHOTO_DISTANCE_M}m allowed)`, checks }
  }
  return { reject: false, reason: null, checks }
}
