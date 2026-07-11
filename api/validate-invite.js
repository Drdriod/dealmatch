// api/validate-invite.js
// Validates an invite code server-side with rate limiting
// Prevents brute-force enumeration of invite codes

import { createClient } from '@supabase/supabase-js'
import { redisRateLimit } from '../src/lib/redis.js'

const ALLOWED_ORIGIN = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Rate limit: 10 checks per minute per IP ─────────────────────────────────
  // Prevents brute-force guessing of invite codes
  const rl = await redisRateLimit(req, 'invite_validate', 10, 60)
  if (!rl.allowed) {
    return res.status(429).json({
      valid: false,
      error: 'Too many attempts. Please wait a minute before trying again.',
    })
  }

  const { code } = req.body || {}

  // ── Input validation ────────────────────────────────────────────────────────
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ valid: false, error: 'Code is required' })
  }

  const clean = code.trim().toLowerCase()

  // Format check - never hit the DB with obviously wrong input
  if (!/^[a-z0-9]{6,12}$/.test(clean)) {
    return res.status(200).json({
      valid: false,
      error: 'Invite codes are 6–12 characters (letters and numbers only)',
    })
  }

  // ── DB lookup using anon key - only reads invite_code + first name ──────────
  // Never expose user ID, email, phone, or any sensitive field
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('invite_code', clean)
    .eq('is_deactivated', false) // suspended/deactivated users can't earn
    .single()

  if (error || !data) {
    // Deliberate: same response for "not found" and DB error
    // Never reveal whether a code almost matched
    return res.status(200).json({
      valid: false,
      error: 'This invite code is not valid. Please check and try again.',
    })
  }

  // ── Return only the first name - never full name, email, or ID ─────────────
  const firstName = (data.full_name || 'a DealMatch member').split(' ')[0]

  return res.status(200).json({
    valid: true,
    inviterName: firstName,
  })
}
