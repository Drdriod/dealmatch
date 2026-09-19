// api/admin/[resource].js
//
// Vercel dynamic route: this ONE file serves /api/admin/login,
// /api/admin/stats, /api/admin/users, and /api/admin/testimonials -
// req.query.resource is populated automatically from the URL segment.
//
// WHY: Vercel's Hobby plan caps a deployment at 12 serverless functions,
// and every file under /api used to count separately (4 admin files +
// growing). Consolidating into one dynamic-route file collapses that to 1
// function while keeping every URL, request/response shape, and auth
// check byte-for-byte identical - no frontend changes required anywhere.
//
// Each resource's logic below is the exact original handler body from its
// own file, just wrapped as a named function instead of a default export.

import { createClient } from '@supabase/supabase-js'
import { redisRateLimit } from '../../src/lib/redis.js'

const ALLOWED_ORIGIN = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'
const ADMIN_EMAILS   = new Set(['divineandbassey@gmail.com', 'prosperwithbassey@gmail.com'])

function getServiceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
function getAnonClient(token) {
  const opts = token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
}

// ─── /api/admin/login ───────────────────────────────────────────────────
async function handleLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ✅ FIX: this body had no try/catch. Any unexpected exception (missing
  // env var, Supabase client init failure, etc.) crashed the function
  // before any res.json() call, so Vercel returned an empty body - which
  // the frontend's res.json() then failed to parse as "Unexpected end of
  // JSON input", masking the real error entirely.
  try {
    const email    = (req.body?.email || '').trim().toLowerCase()
    const password = req.body?.password || ''
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Admin login misconfigured: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY server env vars')
      return res.status(500).json({ error: 'Server misconfiguration. Contact the developer.' })
    }

    const ipLimit = await redisRateLimit(req, 'admin-login-ip', 5, 15 * 60)
    if (!ipLimit.allowed) return res.status(429).json({ error: 'Too many login attempts from this network. Try again in 15 minutes.' })
    const emailLimit = await redisRateLimit(req, `admin-login-email:${email}`, 5, 15 * 60, false)
    if (!emailLimit.allowed) return res.status(429).json({ error: 'Too many failed attempts for this account. Try again in 15 minutes, or reset your password.' })

    const anon = getAnonClient()
    const { data, error } = await anon.auth.signInWithPassword({ email, password })
    if (error) return res.status(401).json({ error: 'Incorrect email or password.' })

    const svc = getServiceClient()
    const { data: profile } = await svc.from('profiles').select('role, full_name').eq('id', data.user.id).single()
    const isAdminEmail = ADMIN_EMAILS.has(data.user.email)
    const isAdminRole  = new Set(['admin', 'agent']).has(profile?.role)

    if (!isAdminEmail && !isAdminRole) {
      await anon.auth.signOut()
      return res.status(403).json({ error: 'Access denied. You do not have admin privileges.' })
    }
    return res.status(200).json({ session: data.session, role: profile?.role, full_name: profile?.full_name })
  } catch (err) {
    console.error('Admin login crashed:', err)
    return res.status(500).json({ error: 'Login failed due to a server error. Please try again.' })
  }
}

// ─── /api/admin/stats ───────────────────────────────────────────────────
async function handleStats(req, res, { user, callerProfile }) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!ADMIN_EMAILS.has(user.email) && !new Set(['admin','agent','verifier']).has(callerProfile?.role)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const rl = await redisRateLimit(req, 'admin_stats', 30, 60)
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })

  const svc = getServiceClient()
  try {
    const results = await Promise.all([
      svc.from('profiles').select('*', { count: 'exact', head: true }),
      svc.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      svc.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      svc.from('professional_applications').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      svc.from('profiles').select('*', { count: 'exact', head: true }).eq('identity_verification_status', 'submitted'),
      svc.from('mortgage_applications').select('*', { count: 'exact', head: true }),
      svc.from('rental_enquiries').select('*', { count: 'exact', head: true }),
      svc.from('payments').select('amount').eq('status', 'success'),
      svc.from('profiles').select('id,full_name,email,role,created_at').order('created_at', { ascending: false }).limit(5),
      svc.from('properties').select('id,title,status,created_at,profiles(full_name)').order('created_at', { ascending: false }).limit(8),
    ])
    const [
      rTotalUsers, rActiveListings, rPendingListings, rTotalPros, rPendingIdentity,
      rMortgageApps, rRentalEnquiries, rPayments, rRecentUsers, rRecentProps,
    ] = results

    // ✅ FIX: previously only `count`/`data` were destructured here and
    // `error` was silently discarded. If the service-role key is ever
    // invalid, rotated, or rejected, Supabase does NOT throw - every query
    // above resolves with { data: null, error: {...}, count: null }. That
    // silently became 0 via `|| 0` below, producing a normal-looking 200
    // response full of fake zeros with zero visible errors anywhere. This
    // is exactly what caused the dashboard to flatline. Now any query
    // error fails loudly with the real reason instead of masquerading as
    // "no data."
    const named = {
      totalUsers: rTotalUsers, activeListings: rActiveListings, pendingListings: rPendingListings,
      totalPros: rTotalPros, pendingIdentity: rPendingIdentity, mortgageApps: rMortgageApps,
      rentalEnquiries: rRentalEnquiries, payments: rPayments, recentUsers: rRecentUsers, recentProps: rRecentProps,
    }
    const failed = Object.entries(named).filter(([, r]) => r.error)
    if (failed.length) {
      console.error('Admin stats: query error(s):', failed.map(([k, r]) => `${k}: ${r.error.message}`).join(' | '))
      return res.status(500).json({ error: `Stats query failed (${failed[0][0]}): ${failed[0][1].error.message}` })
    }

    const totalRevenue = (rPayments.data || []).reduce((s, p) => s + (p.amount || 0), 0)
    return res.status(200).json({
      totalUsers: rTotalUsers.count||0, activeListings: rActiveListings.count||0, pendingListings: rPendingListings.count||0,
      totalPros: rTotalPros.count||0, pendingIdentity: rPendingIdentity.count||0, mortgageApps: rMortgageApps.count||0,
      rentalEnquiries: rRentalEnquiries.count||0, totalRevenue, recentUsers: rRecentUsers.data||[], recentProps: rRecentProps.data||[],
    })
  } catch (err) {
    console.error('Admin stats error:', err.message)
    return res.status(500).json({ error: 'Stats unavailable' })
  }
}

// ─── /api/admin/users ───────────────────────────────────────────────────
async function handleUsers(req, res, { user, callerProfile }) {
  const isSuperAdmin = ADMIN_EMAILS.has(user.email)
  const canRead   = isSuperAdmin || new Set(['admin','agent','verifier']).has(callerProfile?.role)
  const canMutate = isSuperAdmin || new Set(['admin']).has(callerProfile?.role)
  if (!canRead) return res.status(403).json({ error: 'Forbidden' })
  if (req.method === 'POST' && !canMutate) return res.status(403).json({ error: 'Forbidden' })

  const rl = await redisRateLimit(req, 'admin_users', 60, 60)
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })

  const svc = getServiceClient()

  if (req.method === 'GET') {
    const page   = Math.max(0, parseInt(req.query.page  || '0'))
    const limit  = Math.min(100, parseInt(req.query.limit || '50'))
    const search = (req.query.search || '').trim().substring(0, 100)
    const role   = req.query.role || ''
    // NEW: status is now its own filter, separate from role (see fix
    // note above - a suspended admin is still an admin, just suspended).
    const status = req.query.status || ''
    const from   = page * limit
    const to     = from + limit - 1

    let q = svc.from('profiles')
      .select('id,full_name,email,phone,role,account_status,is_photo_verified,is_live_verified,onboarding_completed,created_at,identity_verification_status,is_deactivated', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    if (role)   q = q.eq('role', role)
    if (status) q = q.eq('account_status', status)

    const { data, count, error } = await q
    if (error) { console.error(error.message); return res.status(500).json({ error: 'Fetch failed' }) }
    return res.status(200).json({ users: data || [], total: count || 0, page, limit })
  }

  if (req.method === 'POST') {
    const { action, userId, role: newRole, reason } = req.body || {}
    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId required' })

    const { data: target } = await svc.from('profiles').select('email,role').eq('id', userId).single()
    if (ADMIN_EMAILS.has(target?.email)) return res.status(403).json({ error: 'Cannot modify superadmin' })

    const ALLOWED_ACTIONS = new Set(['set_role','suspend','unsuspend','deactivate'])
    if (!ALLOWED_ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' })
    // FIX: 'suspended' is no longer an assignable role at all - it is
    // moderation status, not identity, and belongs in account_status (see
    // supabase/migrations/20260915000000_fix_role_status_conflation.sql).
    // Every other value that was legal before still is - the persona
    // labels (buyer/seller/renter/landlord/investor/student/professional)
    // are real, current values OnboardingPage.jsx writes on every
    // onboarding completion, not something this pass touches.
    const ALLOWED_ROLES = new Set(['buyer','seller','renter','landlord','agent','investor','student','professional','lender','verifier','admin'])
    if (action === 'set_role' && !ALLOWED_ROLES.has(newRole)) return res.status(400).json({ error: 'Invalid role' })
    // Least privilege: granting the 'admin' role is reserved for the
    // superadmin, and only through the invite flow below in normal
    // operation - this endpoint staying open to 'admin' callers for
    // set_role otherwise let any admin mint more admins.
    if (action === 'set_role' && newRole === 'admin' && !isSuperAdmin) {
      return res.status(403).json({ error: 'Only the superadmin can grant the admin role' })
    }

    let update = {}
    if (action === 'set_role')   update = { role: newRole }
    // FIX: suspend/unsuspend now touch account_status only. role is never
    // written by moderation actions again, so a suspended admin/agent/
    // verifier keeps their real role and gets it back exactly as it was
    // the moment they're unsuspended - no more silent demotion to 'buyer'.
    if (action === 'suspend')    update = { account_status: 'suspended' }
    if (action === 'unsuspend')  update = { account_status: 'active' }
    if (action === 'deactivate') update = { is_deactivated: true, account_status: 'deleted' }

    const { error: updateErr } = await svc.from('profiles').update(update).eq('id', userId)
    if (updateErr) { console.error(updateErr.message); return res.status(500).json({ error: 'Update failed' }) }

    await svc.from('admin_audit_log').insert({
      action: `admin_${action}`, target_id: userId, performed_by: user.id,
      metadata: { new_role: newRole, reason: reason?.substring(0, 200) },
      created_at: new Date().toISOString(),
    }).catch(() => {})

    return res.status(200).json({ success: true })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}

// ─── /api/admin/testimonials ────────────────────────────────────────────
async function handleTestimonials(req, res, { user, callerProfile }) {
  const isSuperAdmin = ADMIN_EMAILS.has(user.email)
  const canRead   = isSuperAdmin || new Set(['admin','agent','verifier']).has(callerProfile?.role)
  const canMutate = isSuperAdmin || new Set(['admin']).has(callerProfile?.role)
  if (!canRead) return res.status(403).json({ error: 'Forbidden' })
  if (req.method === 'POST' && !canMutate) return res.status(403).json({ error: 'Forbidden' })

  const svc = getServiceClient()

  if (req.method === 'GET') {
    const status = req.query?.status || 'pending'
    const { data, error } = await svc.from('testimonials')
      .select('id, user_id, name, role_label, content, rating, status, created_at')
      .eq('status', status).order('created_at', { ascending: false }).limit(100)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ testimonials: data })
  }

  if (req.method === 'POST') {
    const { id, action } = req.body || {}
    if (!id || !['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'id and valid action required' })
    const { error } = await svc.from('testimonials').update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    }).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}

// ─── /api/admin/staff-invite ─────────────────────────────────────────────
// Sends a real Supabase Auth invite email; the invitee sets their own
// password by following that link and is never told one by an admin. Role
// is recorded server-side in staff_invites and only ever applied by
// accept_staff_invite() (see 20260828000004_staff_invite_flow.sql), so
// nothing the invitee's browser sends can change which role they receive.
async function handleStaffInvite(req, res, { user }) {
  const isSuperAdmin = ADMIN_EMAILS.has(user.email)
  if (!isSuperAdmin) return res.status(403).json({ error: 'Only the superadmin can invite staff' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const rl = await redisRateLimit(req, 'admin_staff_invite', 10, 60)
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })

  const { email, fullName, role } = req.body || {}
  const cleanEmail = (email || '').trim().toLowerCase()
  const cleanName  = (fullName || '').trim().substring(0, 120)
  const ALLOWED_STAFF_ROLES = new Set(['agent', 'verifier', 'admin'])

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Invalid email' })
  if (!cleanName) return res.status(400).json({ error: 'Full name required' })
  if (!ALLOWED_STAFF_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' })

  const svc = getServiceClient()

  const { data: existingProfile } = await svc.from('profiles').select('id').eq('email', cleanEmail).maybeSingle()
  if (existingProfile) return res.status(409).json({ error: 'An account with this email already exists' })

  const { error: inviteRowErr } = await svc.from('staff_invites').insert({
    email: cleanEmail, full_name: cleanName, role, invited_by: user.id,
  })
  if (inviteRowErr) {
    // Most likely the partial-unique-index rejecting a second pending
    // invite for the same address.
    return res.status(409).json({ error: 'A pending invite for this email already exists' })
  }

  const { error: sendErr } = await svc.auth.admin.inviteUserByEmail(cleanEmail, {
    redirectTo: `${ALLOWED_ORIGIN}/staff/accept-invite`,
    data: { full_name: cleanName },
  })
  if (sendErr) {
    await svc.from('staff_invites').update({ status: 'revoked' }).eq('email', cleanEmail).eq('status', 'pending')
    console.error('Staff invite email failed:', sendErr.message)
    return res.status(500).json({ error: 'Could not send invite email' })
  }

  await svc.from('admin_audit_log').insert({
    action: 'staff_invited', metadata: { email: cleanEmail, role }, performed_by: user.id,
    created_at: new Date().toISOString(),
  }).catch(() => {})

  return res.status(200).json({ success: true })
}

// ─── Router ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ✅ FIX: this whole function previously had no try/catch. That meant
  // getAnonClient()/getServiceClient() throwing (e.g. missing
  // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
  // as *server* env vars on Vercel) crashed the function before any
  // response was sent, for EVERY resource - not just login. The frontend
  // then silently fell back to RLS-restricted client-side queries, which
  // made it look like an RLS bug when the real failure was here.
  try {
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Admin API misconfigured: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY server env vars')
      return res.status(500).json({ error: 'Server misconfiguration. Contact the developer.' })
    }

    const { resource } = req.query

    if (resource === 'login') return handleLogin(req, res)

    // Every other resource requires an authenticated caller - resolved once
    // here, then passed down, instead of repeating in each handler.
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const anonClient = getAnonClient(token)
    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })
    const { data: callerProfile } = await anonClient.from('profiles').select('role').eq('id', user.id).single()
    const ctx = { user, callerProfile }

    if (resource === 'stats')        return handleStats(req, res, ctx)
    if (resource === 'users')        return handleUsers(req, res, ctx)
    if (resource === 'testimonials') return handleTestimonials(req, res, ctx)
    if (resource === 'staff-invite') return handleStaffInvite(req, res, ctx)

    return res.status(404).json({ error: 'Unknown resource' })
  } catch (err) {
    console.error(`Admin API (${req.query?.resource}) crashed:`, err)
    return res.status(500).json({ error: 'Server error. Please try again.' })
  }
}
