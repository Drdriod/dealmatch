// Repository for the admin API (api/admin/[resource].js). Each function takes the
// client as its first argument and returns the Supabase result. The route checks the
// caller's role before it calls any of these; nothing here checks permissions.

// The caller's own client is used where the route reads on the caller's behalf,
// so row-level security applies. Everything else runs on the service-role client.

export function findCallerRole(userClient, userId) {
  return userClient.from('profiles').select('role').eq('id', userId).single()
}

export function findProfileRoleAndName(svc, userId) {
  return svc.from('profiles').select('role, full_name').eq('id', userId).single()
}

// Dashboard counts and the two recent-activity lists, in one parallel batch.
// The route reads them by position, so keep this order.
export function fetchStatsQueries(svc) {
  return Promise.all([
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
}

// The search text goes into a PostgREST filter string, where commas, parentheses and
// asterisks have meaning. They are replaced, so the text cannot add filter clauses.
export function cleanSearchTerm(raw) {
  return String(raw || '').replace(/[,()*"\\]/g, ' ').trim()
}

// Paged user list. Search runs over name and email; role and status are exact matches.
export function listUsers(svc, { from, to, search, role, status }) {
  let q = svc.from('profiles')
    .select('id,full_name,email,phone,role,account_status,is_photo_verified,is_live_verified,onboarding_completed,created_at,identity_verification_status,is_deactivated', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  const term = cleanSearchTerm(search)
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
  if (role)   q = q.eq('role', role)
  if (status) q = q.eq('account_status', status)
  return q
}

export function findProfileForModeration(svc, userId) {
  return svc.from('profiles').select('email,role').eq('id', userId).single()
}

export function updateProfileById(svc, userId, update) {
  return svc.from('profiles').update(update).eq('id', userId)
}

export function insertAdminAudit(svc, row) {
  return svc.from('admin_audit_log').insert(row)
}

export function listTestimonials(svc, status) {
  return svc.from('testimonials')
    .select('id, user_id, name, role_label, content, rating, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)
}

export function updateTestimonialReview(svc, id, patch) {
  return svc.from('testimonials').update(patch).eq('id', id)
}

export function findProfileIdByEmail(svc, email) {
  return svc.from('profiles').select('id').eq('email', email).maybeSingle()
}

export function insertStaffInvite(svc, row) {
  return svc.from('staff_invites').insert(row)
}

// Marks any pending invite for this address as revoked, after a failed send.
export function revokePendingStaffInvites(svc, email) {
  return svc.from('staff_invites').update({ status: 'revoked' }).eq('email', email).eq('status', 'pending')
}
