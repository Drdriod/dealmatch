/**
 * DealMatch Notifications
 *
 * Creates an in-app notification row (instant popup/bell via Supabase
 * Realtime) and fires a transactional email via the /api/send-email
 * serverless function.
 *
 * Bug fix (2026-08-10): the four marketplace wrappers added in the
 * previous round all used type: 'general', which meant NotificationBell
 * couldn't tell them apart -- an escrow-funded notice and a dispute-opened
 * notice rendered with the identical icon and color. Given each its own
 * type string below; NotificationBell's ICONS/COLORS map updated to match.
 */

import { supabase } from '@/lib/supabase'

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

/* ── Referral payouts (existing, unchanged) ─────────────────────────── */

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

/* ── Marketplace events ─────────────────────────────────────────────── */

export const notifyListingApproved = (userId, listingTitle, link) =>
  notifyUser({
    userId,
    type:    'listing_approved',
    title:   '✅ Your listing is live',
    message: `"${listingTitle}" has been approved and is now visible to buyers.`,
    link: link || '/dashboard',
  })

export const notifyBookingConflict = (userId, details, link) =>
  notifyUser({
    userId,
    type:    'booking_conflict',
    title:   '⚠️ Booking conflict detected',
    message: details || 'Two bookings overlap on your calendar. Please review and resolve.',
    link: link || '/dashboard',
    sendEmail: true,
  })

/** A new bid/offer landed on a transaction the requester posted.
 *  Not yet called anywhere -- no provider-side "submit a bid" UI exists
 *  yet for this to fire from. Wired and ready for when that's built. */
export const notifyBidReceived = (userId, providerName, amountCents, link) =>
  notifyUser({
    userId,
    type:    'bid_received',
    title:   '📩 New offer received',
    message: amountCents
      ? `${providerName} sent an offer of ₦${(amountCents / 100).toLocaleString()}.`
      : `${providerName} responded to your request.`,
    amount: amountCents ? amountCents / 100 : null,
    link: link || '/dashboard',
  })

/** The requester accepted this provider's bid -- notifies the PROVIDER,
 *  not the requester (they already know, they clicked Accept). */
export const notifyBidAccepted = (userId, amountCents, link) =>
  notifyUser({
    userId,
    type:    'bid_accepted',
    title:   '🎉 Your bid was accepted!',
    message: `Your offer of ₦${(amountCents / 100).toLocaleString()} was accepted. Contact details unlock once escrow is funded.`,
    amount: amountCents / 100,
    link: link || '/dashboard',
  })

export const notifyEscrowFunded = (userId, amountCents, link) =>
  notifyUser({
    userId,
    type:    'escrow_funded',
    title:   '🔒 Escrow funded',
    message: `₦${(amountCents / 100).toLocaleString()} is now held in escrow. Contact details have been unlocked.`,
    amount: amountCents / 100,
    link: link || '/dashboard',
  })

export const notifyJobCompleted = (userId, link) =>
  notifyUser({
    userId,
    type:    'job_completed',
    title:   '🎉 Job marked complete',
    message: 'The transaction has been marked complete. Funds will be released per the escrow terms.',
    link: link || '/dashboard',
  })

export const notifyDisputeOpened = (userId, link) =>
  notifyUser({
    userId,
    type:    'dispute_opened',
    title:   '🚩 Dispute opened',
    message: 'A dispute has been opened on one of your transactions. Our team will review within 24 hours.',
    link: link || '/dashboard',
    sendEmail: true,
  })
