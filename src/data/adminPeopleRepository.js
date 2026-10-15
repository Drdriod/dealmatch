// Repository (structural pattern) for the admin people tabs: staff, agent
// scores, complaints and the user directory. Moderation changes set
// account_status, never role, so a suspended staff member keeps their role.
import { supabase } from '@/lib/supabase'

// Staff profiles, plus pending invites when the caller is a superadmin.
export function fetchStaffDirectory(isSuperAdmin, staffRoles) {
  return Promise.all([
    supabase.from('profiles').select('id,full_name,email,role,created_at')
      .in('role', staffRoles).order('created_at', { ascending: false }),
    isSuperAdmin
      ? supabase.from('staff_invites').select('id,email,full_name,role,status,created_at,expires_at')
          .eq('status', 'pending').order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])
}

export function revokeStaffInvite(inviteId) {
  return supabase.rpc('revoke_staff_invite', { p_invite_id: inviteId })
}

export function setAccountStatus(profileId, accountStatus) {
  return supabase.from('profiles').update({ account_status: accountStatus }).eq('id', profileId)
}

export function setProfileRole(profileId, role) {
  return supabase.from('profiles').update({ role }).eq('id', profileId)
}

// Agent score row. Reinstating also clears the strike count.
export function setAgentScoreStatus(agentId, { status, resetStrikes = false }) {
  const patch = { status, updated_at: new Date().toISOString() }
  if (resetStrikes) patch.strike_count = 0
  return supabase.from('agent_scores').update(patch).eq('agent_id', agentId)
}

export function resolveComplaint(complaintId, { status, note, adminId }) {
  const now = new Date().toISOString()
  return supabase.from('complaints').update({
    status, resolution_note: note, resolved_by: adminId, resolved_at: now, updated_at: now,
  }).eq('id', complaintId)
}

// Direct user-directory query, used when the API route is unavailable.
// The page builds the range; this module applies the filters.
export function fetchUsersDirect({ q, role, status, from, to }) {
  let query = supabase.from('profiles')
    .select('id,full_name,email,phone,role,account_status,is_photo_verified,is_live_verified,onboarding_completed,created_at,identity_verification_status,is_deactivated',{count:'exact'})
    .order('created_at', { ascending: false })
    .range(from, to)
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
  if (role) query = query.eq('role', role)
  if (status) query = query.eq('account_status', status)
  return query
}

// Agent scorecard: one row per agent, from the scorecard view.
export function fetchAgentScorecard() {
  return supabase.from('v_agent_scorecard').select('*')
}

// Recent verification submissions for one agent.
export function fetchAgentVerifications(agentId) {
  return supabase.from('agent_verifications')
    .select('*, properties(title,city,state)')
    .eq('agent_id', agentId)
    .order('submitted_at', { ascending: false })
    .limit(20)
}

// Complaints with the listing and both parties, newest first, optionally by status.
export function fetchComplaints(filter) {
  let q = supabase.from('complaints')
    .select('*, properties(title,city,state), profiles!complainant_id(full_name,email), agent:profiles!agent_id(full_name,email)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}
