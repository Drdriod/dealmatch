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
