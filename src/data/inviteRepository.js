// Repository for invite-code checks (api/validate-invite.js). It runs on the anon client,
// so row-level security decides what can be read. The query returns only the name,
// and the route returns only the first name.

export function findInviterFirstName(anonClient, code) {
  return anonClient
    .from('profiles')
    .select('full_name')
    .eq('invite_code', code)
    .eq('is_deactivated', false) // suspended or deactivated users cannot earn
    .single()
}
