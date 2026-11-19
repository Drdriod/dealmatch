// Browser side of the agent site-visit flow (server: api/agent/[action].js).
//
// The agent starts a visit, the server hands back a session id and key, and the agent submits
// GPS, photos and the visit code the property owner reads out at the property. The server
// decides whether the visit counts. Nothing here writes to the database directly.
import { supabase } from '@/lib/supabase'
import { canonicalPayload, signPayload } from './visitSigning.js'

async function post(action, body) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`/api/agent/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'Request failed. Please try again.')
  return json
}

export const startVisit = (propertyId) => post('start', { property_id: propertyId, platform: 'web' })

export async function submitVisit({ session, gps, photos, checklist, verdict, rejectionReason, visitCode }) {
  const lifetime = new Date(session.expires_at) - new Date(session.server_t0)
  const elapsed = Math.min(Math.max(Date.now() - new Date(session.server_t0).getTime(), 0), lifetime)
  const fields = {
    session_id: session.session_id, latitude: gps.lat, longitude: gps.lng, gps_accuracy_m: gps.acc,
    monotonic_elapsed_ms: elapsed, is_mock_location: false, platform: 'web', photos,
  }
  const hmac = await signPayload(session.session_key, canonicalPayload(fields))
  return post('submit', { ...fields, hmac, checklist, verdict, rejection_reason: rejectionReason, visit_code: visitCode })
}

// For the property owner: the code to read out to the agent standing at the property.
export const fetchVisitCode = (propertyId) => post('code', { property_id: propertyId })
