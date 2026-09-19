/**
 * Device Fingerprinting - One Account Per Person
 * Generates a stable hash from device characteristics that don't
 * require any permission and can't be easily spoofed by an average user.
 * Used at signup to catch someone trying to create a 2nd account on
 * the same phone (even with a different email/phone number).
 */

const hashString = async (str) => {
  const encoder = new TextEncoder()
  const data    = encoder.encode(str)
  const hash    = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export const getDeviceFingerprint = async () => {
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      navigator.platform,
    ]
    const raw = parts.join('|')
    return await hashString(raw)
  } catch (err) {
    console.error('Fingerprint error:', err)
    return null
  }
}
