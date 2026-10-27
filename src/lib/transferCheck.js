// The "I have already paid" button on the bank-transfer screen.
//
// The payer asks the server to look for their transfer instead of waiting for the bank's
// notification. The server answers with one of these states (api/platform.js, verify-payment):
//   paid            the money arrived and the item was granted
//   not_found_yet   nothing seen on the account yet
//   processing      the money arrived and is being applied right now
//   needs_review    the money arrived but a person must look at it
//   too_soon        asked again within 15 seconds (HTTP 429)
// This turns the server's answer into what the screen shows. It never decides anything itself:
// "paid" is only ever believed when the server says so.

export const MESSAGES = {
  not_found_yet: 'We have not seen your transfer yet. Banks can take a few minutes. Try again shortly.',
  processing: 'Your transfer arrived and is being applied. This screen updates on its own.',
  needs_review: 'Your transfer arrived, but our team needs to check it. Nothing is lost. Contact support if this stays for long.',
  too_soon: 'Please wait a few seconds before checking again.',
  error: 'We could not check right now. Try again shortly.',
}

export function describeCheck(httpStatus, json) {
  if (httpStatus === 429 || json?.state === 'too_soon') return { paid: false, message: MESSAGES.too_soon }
  if (httpStatus === 200 && json?.state === 'paid') return { paid: true, message: '' }
  if (httpStatus === 200 && MESSAGES[json?.state]) return { paid: false, message: MESSAGES[json.state] }
  return { paid: false, message: MESSAGES.error }
}
