// api/agent/[action].js
//
// Vercel dynamic route: serves /api/agent/start and /api/agent/submit
// as ONE serverless function (see api/admin/[resource].js for why -
// same Hobby-plan function-count reasoning). Logic below is unchanged
// from the original two-file version, just merged under one router.

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import exifr from 'exifr'
import { redisRateLimit } from '../../src/lib/redis.js'
import {
  visitCodeFor, visitCodeMatches, photoPathsAreOwn, evaluatePhotoEvidence, distanceMeters, MAX_PHOTOS_CHECKED,
} from '../../src/lib/visitEvidence.js'
import {
  findPropertyForStart, findPropertyOwner, findActiveSessionForProperty, downloadVerificationPhoto, insertVerificationSession, findSession, setSessionStatus, claimSessionAttempt,
  consumeActiveSession, findPropertyForSubmit, upsertAgentVerification, markPropertyUnderVerification,
} from '../../src/data/agentVerificationRepository.js'

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
  if (!property_id || !['android', 'ios', 'web'].includes(platform)) {
    return res.status(400).json({ error: 'property_id and valid platform (android|ios|web) required' })
  }

  const svc = getServiceClient()
  const { data: property } = await findPropertyForStart(svc, property_id)

  if (!property) return res.status(404).json({ error: 'Property not found' })
  if (property.assigned_agent_id !== user.id) return res.status(403).json({ error: 'You are not the assigned agent for this property' })
  if (property.latitude == null || property.longitude == null) {
    return res.status(422).json({ error: 'Property has no coordinates on file - cannot verify GPS proximity' })
  }

  const serverT0  = new Date()
  const expiresAt = new Date(serverT0.getTime() + SESSION_LIFETIME_MS)

  const { data: session, error: insErr } = await insertVerificationSession(svc, {
    agent_id: user.id, property_id, platform,
    server_t0: serverT0.toISOString(), expires_at: expiresAt.toISOString(), status: 'active',
  })
  if (insErr) return res.status(500).json({ error: insErr.message })

  const sessionKey = crypto.createHmac('sha256', process.env.VERIFICATION_MASTER_SECRET).update(session.id).digest('hex')

  return res.status(200).json({
    session_id: session.id, server_t0: serverT0.toISOString(), expires_at: expiresAt.toISOString(),
    session_key: sessionKey, lifetime_ms: SESSION_LIFETIME_MS, requires_visit_code: true,
  })
}

// ─── /api/agent/code ────────────────────────────────────────────────────
// The property owner asks for the visit code of the current visit and gives it to the
// agent in person. The agent's phone never receives it, so a dishonest agent cannot
// submit a visit they did not make.
async function handleCode(req, res, user) {
  if (!process.env.VERIFICATION_MASTER_SECRET) return res.status(500).json({ error: 'Server misconfiguration' })
  const { property_id } = req.body || {}
  if (!property_id) return res.status(400).json({ error: 'property_id required' })
  const svc = getServiceClient()
  const { data: owner } = await findPropertyOwner(svc, property_id)
  if (!owner || owner.seller_id !== user.id) return res.status(403).json({ error: 'Only the property owner can see the visit code' })
  const { data: session } = await findActiveSessionForProperty(svc, property_id)
  if (!session || new Date() > new Date(session.expires_at)) {
    return res.status(404).json({ error: 'No visit is in progress for this property' })
  }
  return res.status(200).json({ code: visitCodeFor(session.id, process.env.VERIFICATION_MASTER_SECRET), expires_at: session.expires_at })
}

// ─── /api/agent/submit ──────────────────────────────────────────────────
async function handleSubmit(req, res, user) {
  if (!process.env.VERIFICATION_MASTER_SECRET) {
    console.error('VERIFICATION_MASTER_SECRET not set')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const {
    session_id, latitude, longitude, gps_accuracy_m, monotonic_elapsed_ms,
    is_mock_location, platform, hmac, photos, checklist, verdict, rejection_reason, visit_code,
  } = req.body || {}

  if (!session_id || latitude == null || longitude == null || gps_accuracy_m == null ||
      monotonic_elapsed_ms == null || !platform || !hmac || !Array.isArray(photos)) {
    return res.status(400).json({ error: 'Missing required telemetry fields' })
  }
  if ((photos || []).length < 3) return res.status(400).json({ error: 'At least 3 site-visit photos required' })

  const svc = getServiceClient()

  const { data: session } = await findSession(svc, session_id)

  if (!session || session.agent_id !== user.id) return res.status(404).json({ error: 'Session not found' })
  if (session.status !== 'active') return res.status(410).json({ error: `Session already ${session.status} - request a new one` })
  if (new Date() > new Date(session.expires_at)) {
    await setSessionStatus(svc, session_id, 'expired')
    return res.status(410).json({ error: 'Session expired - request a new one' })
  }
  if (session.attempts >= MAX_ATTEMPTS) {
    await setSessionStatus(svc, session_id, 'rejected')
    return res.status(429).json({ error: 'Too many attempts on this session' })
  }
  const { data: claimed, error: claimErr } = await claimSessionAttempt(svc, session_id, session.attempts)
  if (claimErr) return res.status(500).json({ error: 'Could not start verification. Please try again.' })
  if (!claimed?.length) return res.status(409).json({ error: 'This session is busy. Try again in a moment, or request a new session.' })

  const sessionKey = crypto.createHmac('sha256', process.env.VERIFICATION_MASTER_SECRET).update(session_id).digest('hex')
  const expectedHmac = crypto.createHmac('sha256', sessionKey)
    .update(canonicalPayload({ session_id, latitude, longitude, gps_accuracy_m, monotonic_elapsed_ms, is_mock_location, platform, photos }))
    .digest('hex')

  let signatureValid = false
  try { signatureValid = crypto.timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(hmac)) } catch {}
  if (!signatureValid) {
    await setSessionStatus(svc, session_id, 'rejected')
    return res.status(400).json({ error: 'Telemetry integrity check failed - signature mismatch' })
  }

  if (is_mock_location) {
    await setSessionStatus(svc, session_id, 'rejected')
    return res.status(403).json({ error: 'Mock/simulated location detected on this device' })
  }

  if (!visitCodeMatches(session_id, process.env.VERIFICATION_MASTER_SECRET, visit_code)) {
    return res.status(403).json({ error: 'The visit code is missing or wrong. Ask the property owner for the code shown in their My Offers page.' })
  }

  if (gps_accuracy_m > MAX_GPS_ACCURACY_M) {
    return res.status(422).json({ error: `GPS accuracy too low (${Math.round(gps_accuracy_m)}m) - move to an open area and retry` })
  }

  const sessionLifetimeMs = new Date(session.expires_at) - new Date(session.server_t0)
  if (monotonic_elapsed_ms < 0 || monotonic_elapsed_ms > sessionLifetimeMs) {
    await setSessionStatus(svc, session_id, 'rejected')
    return res.status(400).json({ error: 'Implausible capture timing' })
  }
  const capturedAt = new Date(new Date(session.server_t0).getTime() + monotonic_elapsed_ms)

  const { data: property } = await findPropertyForSubmit(svc, session.property_id)
  if (!property || property.assigned_agent_id !== user.id) return res.status(403).json({ error: 'Not authorized for this property' })

  const varianceM = distanceMeters(latitude, longitude, property.latitude, property.longitude)
  if (varianceM > MAX_VARIANCE_M) {
    await setSessionStatus(svc, session_id, 'rejected')
    return res.status(422).json({ error: `You appear to be ${Math.round(varianceM)}m from the property address (max ${MAX_VARIANCE_M}m allowed)`, variance_m: Math.round(varianceM) })
  }

  if (!photoPathsAreOwn(photos, user.id, session.property_id)) {
    await setSessionStatus(svc, session_id, 'rejected')
    return res.status(400).json({ error: 'Photos must be uploaded from this visit' })
  }
  const tags = []
  for (const path of photos.slice(0, MAX_PHOTOS_CHECKED)) {
    try {
      const { data: blob } = await downloadVerificationPhoto(svc, path)
      if (!blob) { tags.push(null); continue }
      const out = await exifr.parse(Buffer.from(await blob.arrayBuffer()), { gps: true, pick: ['DateTimeOriginal', 'latitude', 'longitude'] })
      tags.push(out ? { latitude: out.latitude ?? null, longitude: out.longitude ?? null, takenAt: out.DateTimeOriginal || null } : { latitude: null, longitude: null, takenAt: null })
    } catch { tags.push(null) }
  }
  const evidence = evaluatePhotoEvidence(tags, property, session)
  if (evidence.reject) {
    await setSessionStatus(svc, session_id, 'rejected')
    return res.status(422).json({ error: evidence.reason })
  }

  // Consume only if still active. Two submits racing on one session: the second one
  // finds nothing to update and is refused here, instead of both writing a verification.
  const { data: consumed, error: consumeErr } = await consumeActiveSession(svc, session_id)
  if (consumeErr) return res.status(500).json({ error: 'Could not record this verification. Please try again.' })
  if (!consumed?.length) return res.status(410).json({ error: 'Session already used - request a new one' })

  const { error: upsertErr } = await upsertAgentVerification(svc, {
    property_id: session.property_id, agent_id: user.id, photos,
    gps_lat: latitude, gps_lng: longitude, gps_accuracy_m: Math.round(gps_accuracy_m),
    checklist: checklist || undefined,
    verdict: verdict === 'rejected' ? 'rejected' : 'pending',
    rejection_reason: rejection_reason || null, liability_acknowledged: true,
    visited_at: capturedAt.toISOString(), session_id, monotonic_elapsed_ms,
    captured_at: capturedAt.toISOString(), is_mock_location: false, platform,
    hmac_verified: true, gps_variance_m: Math.round(varianceM),
    visit_code_verified: true, photo_checks: evidence.checks,
  })

  if (upsertErr) return res.status(500).json({ error: upsertErr.message })
  await markPropertyUnderVerification(svc, session.property_id)

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

  const rl = await redisRateLimit(req, `agent_${req.query.action}:${user.id}`, 30, 60, false)
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' })

  const { action } = req.query
  if (action === 'start')  return handleStart(req, res, user)
  if (action === 'submit') return handleSubmit(req, res, user)
  if (action === 'code')   return handleCode(req, res, user)
  return res.status(404).json({ error: 'Unknown action' })
}
