/**
 * DealMatch Notifications
 *
 * Creates an in-app notification row (instant popup/bell via Supabase
 * Realtime) and fires a transactional email via the /api/send-email
 * serverless function.
 *
 * Originally wired only for referral.js payouts (notifyCashReferral,
 * notifyPointsAwarded). This adds the marketplace-event wrappers the
 * `notifications` table's `type` column already reserved space for
 * (listing_approved, booking_conflict, general) plus the ones the
 * event backbone (see src/lib/events.js, ADR-010) needs to fire on:
 * bid received, escrow funded, job completed, dispute opened.
 */

import { supabase } from '@/lib/supabase'

/**
 * Create a notification for a user and optionally email them.
 * Never throws - a failed notification should never block a real
 * money payout, bid, or escrow event from being recorded.
 */
export const notifyUser = async ({
  userId,
  type,
  title,
  message,
  amount = null,
  link = null,
  sendEmail = true,
}) => {
  try {
    await supabase.from('notifications').insert({
      user_id:    userId,
      type,
      title,
      message,
      amount,
      link,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('notifyUser insert error:', err.message)
  }

  if (sendEmail) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      if (profile?.email) {
        await fetch('/api/send-email', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to:      profile.email,
            name:    profile.full_name || 'there',
            subject: title,
            message,
          }),
        })
      }
    } catch (err) {
      console.error('notifyUser email error:', err.message)
    }
  }
}

/* ── Referral payouts (existing) ────────────────────────────────────── */

export const notifyCashReferral = (userId, amount, level, link) =>
  notifyUser({
    userId,
    type:    'referral_cash',
    title:   '💰 You earned N' + amount.toLocaleString() + ' on DealMatch!',
    message: 'Someone in your referral network (Level ' + level + ') just closed a deal. N' + amount.toLocaleString() + ' has been added to your pending earnings.',
    amount,
    link: link || '/referrals',
  })

export const notifyPointsAwarded = (userId, points, level, link) =>
  notifyUser({
    userId,
    type:    'referral_points',
    title:   '⭐ You earned ' + points + ' loyalty points!',
    message: 'A deal closed in your network (Level ' + level + '). ' + points + ' points have been added to your balance. Redeem 100 points for N10,000 cash anytime.',
    amount: points,
    link: link || '/referrals',
  })

/* ── Marketplace events (new) ───────────────────────────────────────── */

/** A listing/profile has passed admin review and is now live */
export const notifyListingApproved = (userId, listingTitle, link) =>
  notifyUser({
    userId,
    type:    'listing_approved',
    title:   '✅ Your listing is live',
    message: `"${listingTitle}" has been approved and is now visible to buyers.`,
    link: link || '/dashboard',
  })

/** A booking/availability clash was detected (e.g. two accepted requests for the same slot) */
export const notifyBookingConflict = (userId, details, link) =>
  notifyUser({
    userId,
    type:    'booking_conflict',
    title:   '⚠️ Booking conflict detected',
    message: details || 'Two bookings overlap on your calendar. Please review and resolve.',
    link: link || '/dashboard',
    sendEmail: true,
  })

/** A new bid/offer landed on a transaction the user requested */
export const notifyBidReceived = (userId, providerName, amountCents, link) =>
  notifyUser({
    userId,
    type:    'general',
    title:   '📩 New offer received',
    message: amountCents
      ? `${providerName} sent an offer of ₦${(amountCents / 100).toLocaleString()}.`
      : `${providerName} responded to your request.`,
    amount: amountCents ? amountCents / 100 : null,
    link: link || '/dashboard',
  })

/** Escrow for a transaction has been funded — work/handover can proceed */
export const notifyEscrowFunded = (userId, amountCents, link) =>
  notifyUser({
    userId,
    type:    'general',
    title:   '🔒 Escrow funded',
    message: `₦${(amountCents / 100).toLocaleString()} is now held in escrow. Contact details have been unlocked.`,
    amount: amountCents / 100,
    link: link || '/dashboard',
  })

/** A transaction was marked complete by both parties, ready for payout */
export const notifyJobCompleted = (userId, link) =>
  notifyUser({
    userId,
    type:    'general',
    title:   '🎉 Job marked complete',
    message: 'The transaction has been marked complete. Funds will be released per the escrow terms.',
    link: link || '/dashboard',
  })

/** A dispute was opened on a transaction the user is party to */
export const notifyDisputeOpened = (userId, link) =>
  notifyUser({
    userId,
    type:    'general',
    title:   '🚩 Dispute opened',
    message: 'A dispute has been opened on one of your transactions. Our team will review within 24 hours.',
    link: link || '/dashboard',
    sendEmail: true,
  })
