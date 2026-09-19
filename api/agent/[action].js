// api/agent/[action].js
//
// Vercel dynamic route: serves /api/agent/start and /api/agent/submit
// as ONE serverless function (see api/admin/[resource].js for why -
// same Hobby-plan function-count reasoning). Logic below is unchanged
// from the original two-file version, just merged under one router.

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const ALLOWED_ORIGIN     = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'
const SESSION_LIFETIME_MS = 4 * 60 * 60 * 1000
const MAX_GPS_ACCURACY_M  = 50
const MAX_VARIANCE_M      = 75
const MAX_ATTEMPTS        = 5

function getAnonClient(token) {
  const opts = token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
}
function getServiceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}
function canonicalPayload({ session_id, latitude, longitude, gps_accuracy_m, monotonic_elapsed_ms, is_mock_location, platform, photos }) {
  return [
    session_id, Number(latitude).toFixed(7), Number(longitude).toFixed(7),
    Math.round(gps_accuracy_m), Math.round(monotonic_elapsed_ms), !!is_mock_location,
    platform, (photos || []).slice().sort().join(','),
  ].join('|')
}

// ─── /api/agent/start ───────────────────────────────────────────────────
async function handleStart(req, res, user) {
  if (!process.env.VERIFICATION_MASTER_SECRET) {
    console.error('VERIFICATION_MASTER_SECRET not set')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }
  const { property_id, platform } = req.body || {}
  if (!property_id || !['android', 'ios'].includes(platform)) {
    return res.status(400).json({ error: 'property_id and valid platform (android|ios) required' })
  }

  const svc = getServiceClient()
  const { data: property } = await svc.from('properties')
    .select('id, assigned_agent_id, latitude, longitude, status').eq('id', property_id).single()

  if (!property) return res.status(404).json({ error: 'Property not found' })
  if (property.assigned_agent_id !== user.id) return res.status(403).json({ error: 'You are not the assigned agent for this property' })
  if (property.latitude == null || property.longitude == null) {
    return res.status(422).json({ error: 'Property has no coordinates on file - cannot verify GPS proximity' })
  }

  const serverT0  = new Date()
  const expiresAt = new Date(serverT0.getTime() + SESSION_LIFETIME_MS)

  const { data: session, error: insErr } = await svc.from('verification_sessions').insert({
    agent_id: user.id, property_id, platform,
    server_t0: serverT0.toISOString(), expires_at: expiresAt.toISOString(), status: 'active',
  }).select('id').single()
  if (insErr) return res.status(500).json({ error: insErr.message })

  const sessionKey = crypto.createHmac('sha256', process.env.VERIFICATION_MASTER_SECRET).update(session.id).digest('hex')

  return res.status(200).json({
    session_id: session.id, server_t0: serverT0.toISOString(), expires_at: expiresAt.toISOString(),
    session_key: sessionKey, lifetime_ms: SESSION_LIFETIME_MS,
  })
}

// ─── /api/agent/submit ──────────────────────────────────────────────────
async function handleSubmit(req, res, user) {
  if (!process.env.VERIFICATION_MASTER_SECRET) {
    console.error('VERIFICATION_MASTER_SECRET not set')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const {
    session_id, latitude, longitude, gps_accuracy_m, monotonic_elapsed_ms,
    is_mock_location, platform, hmac, photos, checklist, verdict, rejection_reason,
  } = req.body || {}

  if (!session_id || latitude == null || longitude == null || gps_accuracy_m == null ||
      monotonic_elapsed_ms == null || !platform || !hmac || !Array.isArray(photos)) {
    return res.status(400).json({ error: 'Missing required telemetry fields' })
  }
  if ((photos || []).length < 3) return res.status(400).json({ error: 'At least 3 site-visit photos required' })

  const svc = getServiceClient()

  const { data: session } = await svc.from('verification_sessions')
    .select('id, agent_id, property_id, server_t0, expires_at, status, attempts').eq('id', session_id).single()

  if (!session || session.agent_id !== user.id) return res.status(404).json({ error: 'Session not found' })
  if (session.status !== 'active') return res.status(410).json({ error: `Session already ${session.status} - request a new one` })
  if (new Date() > new Date(session.expires_at)) {
    await svc.from('verification_sessions').update({ status: 'expired' }).eq('id', session_id)
    return res.status(410).json({ error: 'Session expired - request a new one' })
  }
  if (session.attempts >= MAX_ATTEMPTS) {
    await svc.from('verification_sessions').update({ status: 'rejected' }).eq('id', session_id)
    return res.status(429).json({ error: 'Too many attempts on this session' })
  }
  await svc.from('verification_sessions').update({ attempts: session.attempts + 1 }).eq('id', session_id)

  const sessionKey = crypto.createHmac('sha256', process.env.VERIFICATION_MASTER_SECRET).update(session_id).digest('hex')
  const expectedHmac = crypto.createHmac('sha256', sessionKey)
    .update(canonicalPayload({ session_id, latitude, longitude, gps_accuracy_m, monotonic_elapsed_ms, is_mock_location, platform, photos }))
    .digest('hex')

  let signatureValid = false
  try { signatureValid = crypto.timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(hmac)) } catch {}
  if (!signatureValid) {
    await svc.from('verification_sessions').update({ status: 'rejected' }).eq('id', session_id)
    return res.status(400).json({ error: 'Telemetry integrity check failed - signature mismatch' })
  }

  if (is_mock_location) {
    await svc.from('verification_sessions').update({ status: 'rejected' }).eq('id', session_id)
    return res.status(403).json({ error: 'Mock/simulated location detected on this device' })
  }

  if (gps_accuracy_m > MAX_GPS_ACCURACY_M) {
    return res.status(422).json({ error: `GPS accuracy too low (${Math.round(gps_accuracy_m)}m) - move to an open area and retry` })
  }

  const sessionLifetimeMs = new Date(session.expires_at) - new Date(session.server_t0)
  if (monotonic_elapsed_ms < 0 || monotonic_elapsed_ms > sessionLifetimeMs) {
    await svc.from('verification_sessions').update({ status: 'rejected' }).eq('id', session_id)
    return res.status(400).json({ error: 'Implausible capture timing' })
  }
  const capturedAt = new Date(new Date(session.server_t0).getTime() + monotonic_elapsed_ms)

  const { data: property } = await svc.from('properties')
    .select('id, latitude, longitude, assigned_agent_id').eq('id', session.property_id).single()
  if (!property || property.assigned_agent_id !== user.id) return res.status(403).json({ error: 'Not authorized for this property' })

  const varianceM = distanceMeters(latitude, longitude, property.latitude, property.longitude)
  if (varianceM > MAX_VARIANCE_M) {
    await svc.from('verification_sessions').update({ status: 'rejected' }).eq('id', session_id)
    return res.status(422).json({ error: `You appear to be ${Math.round(varianceM)}m from the property address (max ${MAX_VARIANCE_M}m allowed)`, variance_m: Math.round(varianceM) })
  }

  await svc.from('verification_sessions').update({ status: 'consumed' }).eq('id', session_id)

  const { error: upsertErr } = await svc.from('agent_verifications').upsert({
    property_id: session.property_id, agent_id: user.id, photos,
    gps_lat: latitude, gps_lng: longitude, gps_accuracy_m: Math.round(gps_accuracy_m),
    checklist: checklist || undefined,
    verdict: verdict === 'rejected' ? 'rejected' : 'pending',
    rejection_reason: rejection_reason || null, liability_acknowledged: true,
    visited_at: capturedAt.toISOString(), session_id, monotonic_elapsed_ms,
    captured_at: capturedAt.toISOString(), is_mock_location: false, platform,
    hmac_verified: true, gps_variance_m: Math.round(varianceM),
  }, { onConflict: 'property_id,agent_id' })

  if (upsertErr) return res.status(500).json({ error: upsertErr.message })
  await svc.from('properties').update({ status: 'under_verification' }).eq('id', session.property_id)

  return res.status(200).json({
    ok: true, captured_at: capturedAt.toISOString(), variance_m: Math.round(varianceM),
    message: 'Telemetry verified. Submission is now pending admin review.',
  })
}

// ─── Router ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Missing token' })
  const anon = getAnonClient(token)
  const { data: { user }, error: authErr } = await anon.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { action } = req.query
  if (action === 'start')  return handleStart(req, res, user)
  if (action === 'submit') return handleSubmit(req, res, user)
  return res.status(404).json({ error: 'Unknown action' })
}
