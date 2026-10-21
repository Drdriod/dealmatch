// Repository for the agent site-verification flow (api/agent/[action].js). Each function
// takes the service-role client as its first argument and returns the Supabase result.
//
// A verification session moves active -> consumed | rejected | expired, once. Every
// transition is conditional on the session still being active, so two requests racing
// on one session cannot both move it.

export function findPropertyForStart(svc, propertyId) {
  return svc.from('properties')
    .select('id, assigned_agent_id, latitude, longitude, status')
    .eq('id', propertyId)
    .single()
}

export function insertVerificationSession(svc, row) {
  return svc.from('verification_sessions').insert(row).select('id').single()
}

export function findSession(svc, sessionId) {
  return svc.from('verification_sessions')
    .select('id, agent_id, property_id, server_t0, expires_at, status, attempts')
    .eq('id', sessionId)
    .single()
}

export function setSessionStatus(svc, sessionId, status) {
  return svc.from('verification_sessions')
    .update({ status })
    .eq('id', sessionId)
    .eq('status', 'active')
}

// Counts one attempt, but only if the count is still the value the caller read. Two
// submits racing on one session cannot both count from the same starting value.
// Returns the updated row, or no rows if another attempt got there first.
export function claimSessionAttempt(svc, sessionId, readAttempts) {
  return svc.from('verification_sessions')
    .update({ attempts: readAttempts + 1 })
    .eq('id', sessionId)
    .eq('status', 'active')
    .eq('attempts', readAttempts)
    .select('id')
}

// Returns the consumed row, or no rows if the session was no longer active.
export function consumeActiveSession(svc, sessionId) {
  return svc.from('verification_sessions')
    .update({ status: 'consumed' })
    .eq('id', sessionId)
    .eq('status', 'active')
    .select('id')
}

export function findPropertyForSubmit(svc, propertyId) {
  return svc.from('properties')
    .select('id, latitude, longitude, assigned_agent_id')
    .eq('id', propertyId)
    .single()
}

export function upsertAgentVerification(svc, row) {
  return svc.from('agent_verifications').upsert(row, { onConflict: 'property_id,agent_id' })
}

export function markPropertyUnderVerification(svc, propertyId) {
  return svc.from('properties').update({ status: 'under_verification' }).eq('id', propertyId)
}
