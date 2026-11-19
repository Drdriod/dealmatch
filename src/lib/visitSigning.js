// Signing for the agent site-visit flow. Pure (no imports) so it can be tested against the server.

// Must match canonicalPayload() on the server exactly.
export function canonicalPayload({ session_id, latitude, longitude, gps_accuracy_m, monotonic_elapsed_ms, is_mock_location, platform, photos }) {
  return [
    session_id, Number(latitude).toFixed(7), Number(longitude).toFixed(7),
    Math.round(gps_accuracy_m), Math.round(monotonic_elapsed_ms), !!is_mock_location,
    platform, (photos || []).slice().sort().join(','),
  ].join('|')
}

export async function signPayload(sessionKey, payload) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(sessionKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

