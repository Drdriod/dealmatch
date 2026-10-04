// Feature switches and platform helpers.
//
// Crypto (USDT/USDC) payments are ON HOLD while DealMatch confirms they meet
// Nigerian regulation and compliance requirements. While this is false:
//   - the website shows the option as "Coming soon" and it cannot be used
//   - the Android/iOS app does not show it at all
//   - the database refuses new crypto_payments rows from users
//     (migration 20261004000002_crypto_payments_on_hold.sql)
// To turn it back on: set this to true, and re-grant INSERT as described in
// that migration.
export const CRYPTO_PAYMENTS_ENABLED = false

export const CRYPTO_HOLD_MESSAGE =
  'Crypto payments are on hold while we confirm they meet Nigerian regulation and compliance requirements. Card and bank payments are fully available.'

/** True inside the Capacitor Android/iOS app shell, false in a normal browser. */
export const isNativeApp = () =>
  typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
