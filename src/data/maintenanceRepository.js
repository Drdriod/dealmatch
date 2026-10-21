// Repository for the daily maintenance work in the cron (api/platform.js).
// Service-role client only.

// Downgrades providers whose verification has expired (ADR-009).
export function demoteExpiredVerifications(svc) {
  return svc.rpc('demote_expired_verifications')
}

// Cancels hotel bookings still pending after the payment window, which releases their rooms.
export function cancelUnpaidBookings(svc, createdBeforeIso) {
  return svc.from('bookings')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .lt('created_at', createdBeforeIso)
    .select('id')
}
