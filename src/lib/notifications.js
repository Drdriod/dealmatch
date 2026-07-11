/**
 * DealMatch Notifications
 *
 * Creates an in-app notification row (instant popup/bell via Supabase
 * Realtime) and fires a transactional email via the /api/send-email
 * serverless function. Used by referral.js whenever a deal closes and
 * automatically pays out cash or points - no manual lookup required.
 */

import { supabase } from '@/lib/supabase'

/**
 * Create a notification for a user and optionally email them.
 * Never throws - a failed notification should never block a real
 * money payout from being recorded.
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
      // Look up the user's email from their profile
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
      // Email failures are non-fatal - the in-app notification still landed
      console.error('notifyUser email error:', err.message)
    }
  }
}

/** Convenience wrapper for cash referral payout notifications */
export const notifyCashReferral = (userId, amount, level, link) =>
  notifyUser({
    userId,
    type:    'referral_cash',
    title:   '💰 You earned N' + amount.toLocaleString() + ' on DealMatch!',
    message: 'Someone in your referral network (Level ' + level + ') just closed a deal. N' + amount.toLocaleString() + ' has been added to your pending earnings.',
    amount,
    link: link || '/referrals',
  })

/** Convenience wrapper for loyalty points notifications */
export const notifyPointsAwarded = (userId, points, level, link) =>
  notifyUser({
    userId,
    type:    'referral_points',
    title:   '⭐ You earned ' + points + ' loyalty points!',
    message: 'A deal closed in your network (Level ' + level + '). ' + points + ' points have been added to your balance. Redeem 100 points for N10,000 cash anytime.',
    amount: points,
    link: link || '/referrals',
  })
