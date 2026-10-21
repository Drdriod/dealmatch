// Factory (creational pattern) for server-side notifications.
//
// Every notification the server writes is built here. A kind has one type
// string, one title, one message and one link, so the copy lives in one place
// and every row has the same shape. To add a notification, add one entry to
// KINDS and call insertNotification().
//
// The wording of each kind is what users already see. Changing it here changes
// it everywhere.

export const money = (kobo) => '₦' + (Number(kobo || 0) / 100).toLocaleString('en-NG')
const naira = (amount) => '₦' + Number(amount).toLocaleString('en-NG')

const KINDS = {
  referral_cash: ({ amount, level }) => ({
    title: '💰 You earned N' + Number(amount).toLocaleString() + ' on DealMatch!',
    message: 'Someone in your referral network (Level ' + level + ') just closed a deal. N'
      + Number(amount).toLocaleString() + ' has been added to your pending earnings.',
    amount,
    link: '/referrals',
  }),

  referral_points: ({ points, level }) => ({
    title: '⭐ You earned ' + points + ' loyalty points!',
    message: 'A deal closed in your network (Level ' + level + '). ' + points
      + ' points have been added to your balance. Redeem 100 points for N10,000 cash anytime.',
    amount: points,
    link: '/referrals',
  }),

  escrow_funded: ({ amount, transactionId }) => ({
    title: '🔒 Escrow funded',
    message: `${naira(amount)} is now held in escrow. Contact details have been unlocked.`,
    amount,
    link: `/jobs/${transactionId}`,
  }),

  payout_paid: ({ amountCents }) => ({
    title: 'Payout sent',
    message: `${money(amountCents)} has been sent to your bank account.`,
    link: '/wallet',
  }),

  payout_failed: ({ amountCents }) => ({
    title: 'Payout not received',
    message: `Your payout of ${money(amountCents)} did not reach your bank account. Our team has been notified and will contact you.`,
    link: '/wallet',
  }),

  payout_failed_admin: ({ payoutId, amountCents }) => ({
    title: 'Payout failed',
    message: `Payout #${payoutId} of ${money(amountCents)} failed. Review it in Payouts.`,
    link: '/admin',
  }),

  payout_stuck: ({ payoutId, transferRef, status }) => ({
    title: 'Payout still pending at Flutterwave',
    message: `Payout #${payoutId} (transfer ${transferRef}) is still ${status} after three days. Check it with Flutterwave.`,
    link: '/admin',
  }),

  payment_return_overpaid: ({ amountKobo }) => ({
    title: 'We will return your extra payment',
    message: `You paid ${money(amountKobo)} more than the price. We will return it to you.`,
    link: '/wallet',
  }),

  payment_return_unapplied: ({ amountKobo }) => ({
    title: 'We could not apply your payment',
    message: `We received ${money(amountKobo)}, but it could not be applied to the job. We will return it to you.`,
    link: '/wallet',
  }),

  payment_return_short: ({ amountKobo }) => ({
    title: 'Your payment is short',
    message: `We received ${money(amountKobo)} of the price. Please contact us to complete or refund it.`,
    link: '/wallet',
  }),

  refund_due: ({ reason, reference, amountKobo }) => ({
    title: 'Money to return',
    message: `${reason} payment ${reference}: ${money(amountKobo)}. Return it from Monetisation.`,
    link: '/admin/monetisation',
  }),
}

export const NOTIFICATION_KINDS = Object.freeze(Object.keys(KINDS))

// Build one notification row for a user. Throws on an unknown kind, so a typo
// is caught in tests and not silently written.
export function buildNotification(kind, userId, params = {}, now = new Date()) {
  const build = Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null
  if (!build) throw new Error(`Unknown notification kind: ${kind}`)
  const { title, message, amount = null, link = null } = build(params)
  return {
    user_id: userId,
    type: kind,
    title,
    message,
    amount,
    link,
    created_at: now.toISOString(),
  }
}

// Write one notification. Errors are logged, not thrown: a failed notice must
// never undo the money movement it describes.
export async function insertNotification(svc, kind, userId, params = {}) {
  if (!userId) return false
  try {
    const { error } = await svc.from('notifications').insert(buildNotification(kind, userId, params))
    if (error) throw error
    return true
  } catch (err) {
    console.error(`notification ${kind} failed:`, err.message)
    return false
  }
}
