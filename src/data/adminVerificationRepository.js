// Repository (structural pattern) for the admin verification tabs: identity,
// skill verification and student verification. Documents are read through
// short-lived signed URLs from private buckets, never public ones.
import { supabase } from '@/lib/supabase'

const SIGNED_URL_SECONDS = 1800 // 30 minutes

// Signed URL for one private file, or null when it cannot be signed.
export async function signedDocumentUrl(bucket, path) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS)
  return data?.signedUrl || null
}

// ── Identity ──
// filter is 'all' (submitted, approved or rejected) or one status.
export function fetchIdentitySubmissions(filter) {
  const q = supabase.from('profiles')
    .select('id,full_name,email,phone,role,identity_photo_url,identity_selfie_url,identity_doc_type,identity_verification_status,identity_verified_at,identity_rejection_note,identity_nin_submitted_at,created_at')
    .order('created_at', { ascending: false }).limit(200)
  return filter === 'all'
    ? q.in('identity_verification_status', ['submitted', 'approved', 'rejected'])
    : q.eq('identity_verification_status', filter)
}

export function approveIdentity(userId, adminId) {
  return supabase.from('profiles').update({
    identity_verification_status: 'approved', is_photo_verified: true, is_live_verified: true,
    identity_verified_at: new Date().toISOString(), identity_verified_by: adminId,
    identity_rejection_note: null, verification_skipped: false,
  }).eq('id', userId)
}

export function rejectIdentity(userId, adminId, note) {
  return supabase.from('profiles').update({
    identity_verification_status: 'rejected', is_photo_verified: false, is_live_verified: false,
    identity_rejection_note: note, identity_verified_by: adminId,
  }).eq('id', userId)
}

// ── Skill verification (level 2 provider submissions) ──
export function fetchSkillSubmissions(filter) {
  let q = supabase.from('verification_submissions')
    .select('id,user_id,level,kind,submission_data,status,admin_note,created_at')
    .eq('level', 2).order('created_at', { ascending: false }).limit(200)
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}

export function fetchContactProfiles(userIds) {
  return supabase.from('profiles').select('id,full_name,email,phone').in('id', userIds)
}

// The database function checks the reviewer's role and writes the decision.
export function reviewSkillSubmission(submissionId, approve, note) {
  return supabase.rpc('review_verification_submission', {
    p_submission_id: submissionId, p_approve: approve, p_note: note,
  })
}

// ── Student verification ──
export function fetchStudentVerifications(filter) {
  let q = supabase.from('student_verifications')
    .select('*,profiles(full_name,email)')
    .order('created_at', { ascending: false }).limit(200)
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}

export function setStudentVerificationStatus(id, { status, adminId, reason = null }) {
  const patch = { status, reviewed_by: adminId, reviewed_at: new Date().toISOString() }
  if (reason !== null) patch.rejection_reason = reason
  return supabase.from('student_verifications').update(patch).eq('id', id)
}

export function setStudentVerified(userId, verified) {
  return supabase.from('profiles').update({ is_student_verified: verified }).eq('id', userId)
}
