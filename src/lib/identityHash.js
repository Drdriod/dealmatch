// Server only. Never import this from UI code.
//
// SEC-1: keyed HMAC-SHA256 of a NIN or BVN, used to detect duplicate identities.
// A NIN has only 11 digits, so an unkeyed hash can be reversed by brute force.
// The key is kept out of the database and out of SQL. The hash is computed here,
// in Node, and the result is stored in verified_providers.identity_hmac.
//
// Key: IDENTITY_HMAC_KEY (set in Vercel, Production and Preview separately).
// Rotating the key changes every hash, so duplicate detection restarts from zero.
// Rotation needs a re-hash job before it is done (see docs/adr/ADR-009).

import crypto from 'crypto'

export class IdentityHashError extends Error {}

export function identityHmac(rawNinOrBvn) {
  const key = process.env.IDENTITY_HMAC_KEY
  if (!key || key.length < 32) {
    throw new IdentityHashError('IDENTITY_HMAC_KEY is missing or shorter than 32 characters')
  }

  const digits = String(rawNinOrBvn ?? '').replace(/\D/g, '')
  if (digits.length !== 11) {
    throw new IdentityHashError('NIN/BVN must contain exactly 11 digits')
  }

  return crypto.createHmac('sha256', key).update(digits, 'utf8').digest('hex')
}
