// Flutterwave V4 server-side client (server only: never import from src/ UI code).
//
// Auth: OAuth client credentials. Exchange FLUTTERWAVE_V4_CLIENT_ID and
// FLUTTERWAVE_V4_CLIENT_SECRET for a bearer token (valid 600 seconds), cache it
// in memory and refresh a minute before expiry.
//
// Base URL comes from FLUTTERWAVE_BASE_URL so sandbox and live are switched by
// configuration, not code:
//   sandbox: https://developersandbox-api.flutterwave.com
//   live:    https://f4bexperience.flutterwave.com

import { randomBytes } from 'node:crypto'

const TOKEN_URL = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token'

let cachedToken = null // { value, expiresAt }

export class FlutterwaveError extends Error {
  constructor(message, { status, body } = {}) {
    super(message)
    this.name = 'FlutterwaveError'
    this.status = status
    this.body = body
  }
}

export function flutterwaveConfigured() {
  return Boolean(
    process.env.FLUTTERWAVE_V4_CLIENT_ID &&
    process.env.FLUTTERWAVE_V4_CLIENT_SECRET &&
    process.env.FLUTTERWAVE_BASE_URL
  )
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const body = new URLSearchParams({
    client_id: process.env.FLUTTERWAVE_V4_CLIENT_ID,
    client_secret: process.env.FLUTTERWAVE_V4_CLIENT_SECRET,
    grant_type: 'client_credentials',
  })
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await r.json().catch(() => null)
  if (!r.ok || !json?.access_token) {
    throw new FlutterwaveError('Could not get a Flutterwave access token', { status: r.status })
  }
  // Refresh one minute early, as Flutterwave recommends
  const lifetimeMs = Math.max(0, (Number(json.expires_in) || 600) - 60) * 1000
  cachedToken = { value: json.access_token, expiresAt: Date.now() + lifetimeMs }
  return cachedToken.value
}

// Call a V4 endpoint. Returns the `data` object on success, throws otherwise.
// idempotencyKey must be 12-255 alphanumeric characters (Flutterwave rule).
export async function flw(method, path, { body, idempotencyKey } = {}) {
  const token = await getAccessToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Trace-Id': randomBytes(12).toString('hex'), // alphanumeric, 24 chars
    Accept: 'application/json',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey

  const r = await fetch(`${process.env.FLUTTERWAVE_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await r.json().catch(() => null)
  if (!r.ok || json?.status !== 'success') {
    const message = json?.error?.message || json?.message || `Flutterwave ${method} ${path} failed (${r.status})`
    throw new FlutterwaveError(message, { status: r.status, body: json })
  }
  return json.data
}

// Keep only letters and digits: used to build idempotency keys from references
export const alnum = (s) => String(s).replace(/[^a-zA-Z0-9]/g, '')
