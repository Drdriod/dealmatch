// Repository for outbound messages (api/send-email.js, api/send-whatsapp.js). Every
// send is logged, and the recipient is always looked up here, from the user id the
// caller names. Service-role client only.

export function findRecipientEmail(svc, userId) {
  return svc.from('profiles').select('email, full_name').eq('id', userId).single()
}

export function findRecipientPhone(svc, userId) {
  return svc.from('profiles').select('phone').eq('id', userId).single()
}

export function logOutboundMessage(svc, row) {
  return svc.from('outbound_message_log').insert(row)
}

// ── Who may message whom (audit F-003) ─────────────────────────────────────────
// A signed-in user could name ANY user id and have DealMatch email or WhatsApp them free text.
// A message is now allowed only to yourself, from staff, or between two accounts that share a
// real dealing: a job (transactions), an escrow, a dispute, an inspection, or the referral chain
// above the caller (the person who invited them, and who invited that person, up to 10 levels).
const STAFF_ROLES = ['admin', 'superadmin', 'agent', 'verifier']

async function inviterChain(svc, userId) {
  const chain = new Set()
  let current = userId
  for (let i = 0; i < 10 && current; i++) {
    const { data } = await svc.from('profiles').select('invited_by').eq('id', current).single()
    const next = data?.invited_by
    if (!next || chain.has(next)) break
    chain.add(next)
    current = next
  }
  return chain
}

const pair = (a, b) => `and(requester_id.eq.${a},provider_id.eq.${b}),and(requester_id.eq.${b},provider_id.eq.${a})`

export async function mayMessage(svc, callerId, targetId) {
  if (!callerId || !targetId) return false
  if (callerId === targetId) return true
  // ids go into filters below, so only well-formed uuids get that far
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(callerId) || !uuid.test(targetId)) return false

  const { data: me } = await svc.from('profiles').select('role').eq('id', callerId).single()
  if (STAFF_ROLES.includes(me?.role)) return true

  const checks = await Promise.all([
    svc.from('transactions').select('id').or(pair(callerId, targetId)).limit(1),
    svc.from('escrow_transactions').select('id')
      .or(`and(buyer_id.eq.${callerId},seller_id.eq.${targetId}),and(buyer_id.eq.${targetId},seller_id.eq.${callerId}),`
        + `and(tenant_id.eq.${callerId},seller_id.eq.${targetId}),and(tenant_id.eq.${targetId},seller_id.eq.${callerId}),`
        + `and(agent_id.eq.${callerId},buyer_id.eq.${targetId}),and(agent_id.eq.${callerId},tenant_id.eq.${targetId}),`
        + `and(agent_id.eq.${callerId},seller_id.eq.${targetId})`).limit(1),
    svc.from('disputes').select('id')
      .or(`and(reporter_id.eq.${callerId},against_id.eq.${targetId}),and(reporter_id.eq.${targetId},against_id.eq.${callerId})`).limit(1),
    svc.from('property_inspections').select('id')
      .or(`and(buyer_id.eq.${callerId},landlord_id.eq.${targetId}),and(buyer_id.eq.${targetId},landlord_id.eq.${callerId})`).limit(1),
  ])
  if (checks.some(r => r.data?.length)) return true

  return (await inviterChain(svc, callerId)).has(targetId)
}
