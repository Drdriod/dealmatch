// Repository for account deletion and identity submission (api/platform.js). Every
// function takes the client as its first argument and returns the Supabase result.
// The caller chooses the client: these run on the service-role client.

// What is blocking deletion right now (for example, open payouts).
export function findDeletionBlockers(svc, userId) {
  return svc.rpc('account_deletion_blockers', { p_user: userId })
}

// Erases the personal data in one database function. The auth user is anonymised by the caller.
export function eraseAccountData(svc, userId) {
  return svc.rpc('erase_account_data', { p_user: userId })
}

export function findIdentityStatus(svc, userId) {
  return svc.from('profiles')
    .select('identity_verification_status')
    .eq('id', userId)
    .maybeSingle()
}

// Stores the hash of a NIN or BVN. The raw number never reaches this function.
export function saveIdentityHash(svc, userId, hash, nowIso) {
  return svc.from('profiles').update({
    identity_hmac: hash,
    identity_nin_submitted_at: nowIso,
  }).eq('id', userId)
}
