// Server logs as one JSON line each: {"level":"info","event":"escrow.funded","reference":"..."}.
// Vercel's log search can filter on any field, which plain sentences ("Escrow funded: ref") cannot.
//
// Rules for `fields`: ids, references and amounts only. Never an email, phone number, name, token
// or message text. Use the `event` name (dotted, lower case) for what happened.
// For failures that should reach Sentry, keep using captureError; this is for the normal trail.

const line = (level, event, fields) => {
  try {
    return JSON.stringify({ level, event, ...fields })
  } catch {
    return JSON.stringify({ level, event, note: 'fields could not be serialised' })
  }
}

export const log = {
  info: (event, fields = {}) => console.log(line('info', event, fields)),
  warn: (event, fields = {}) => console.warn(line('warn', event, fields)),
  error: (event, fields = {}) => console.error(line('error', event, fields)),
}
