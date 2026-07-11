/**
 * DealMatch Referral & Loyalty Points System
 * 
 * CASH REFERRAL CHAIN (3 levels):
 *   Level 1 - 8% of DealMatch commission (direct referrer)
 *   Level 2 - 4% of DealMatch commission
 *   Level 3 - 2% of DealMatch commission
 *
 * LOYALTY POINTS (Level 4 and beyond):
 *   Level 4  - 60 points per deal
 *   Level 5  - 40 points per deal
 *   Level 6  - 25 points per deal
 *   Level 7  - 15 points per deal
 *   Level 8  - 10 points per deal
 *   Level 9  -  5 points per deal
 *   Level 10+ -  2 points per deal
 *
 * POINTS CONVERSION:
 *   100 points = ₦10,000 cash (minimum 100 points to redeem)
 *   Option B rule: ₦2M in network deals = 10 points (server-side calc)
 */

import { supabase } from '@/lib/supabase'
import { notifyCashReferral, notifyPointsAwarded } from '@/lib/notifications'

// Cash referral rates per level (applies on transactions >= FULL_CHAIN_THRESHOLD)
export const CASH_RATES = {
  1: 0.08,
  2: 0.04,
  3: 0.02,
}

// Tiered referral thresholds - protects margin on small transactions
// while still rewarding sharing behaviour
export const FULL_CHAIN_THRESHOLD = 50000   // DM commission >= this: full 8/4/2% cash chain
export const FLAT_TIER_THRESHOLD  = 5000    // DM commission >= this: flat cash per referrer
export const FLAT_REFERRAL_AMOUNT = 500     // flat cash per referrer (L1, L2, L3) in flat tier
// Below FLAT_TIER_THRESHOLD: points only, no cash referral at any level

/**
 * Determine which referral tier a transaction falls into
 * based on DealMatch's commission earned (not the deal value)
 */
export const getReferralTier = (dmCommission) => {
  if (dmCommission >= FULL_CHAIN_THRESHOLD) return 'full'
  if (dmCommission >= FLAT_TIER_THRESHOLD)  return 'flat'
  return 'points_only'
}

// Points awarded per level per deal (fixed per deal, not per value)
// Used for: (a) all Level 4+ referrals regardless of transaction size
//           (b) Level 1-3 referrals when the transaction is in the
//               'points_only' tier (small transactions, no cash payout)
export const POINTS_PER_LEVEL = {
  1:  15,   // only applies on points_only tier transactions
  2:  10,   // only applies on points_only tier transactions
  3:   5,   // only applies on points_only tier transactions
  4:  60,
  5:  40,
  6:  25,
  7:  15,
  8:  10,
  9:   5,
  10:  2,
}
export const POINTS_DEFAULT = 2 // level 11+

// Points conversion
export const POINTS_TO_CASH_RATE = 100    // 100 points = ₦10,000
export const POINTS_CASH_VALUE   = 10000  // ₦10,000 per 100 points
export const MIN_REDEEM_POINTS   = 100    // minimum to redeem

// Agent payments
export const AGENT_FIELD_FEE   = 3000
export const AGENT_SENIOR_FEE  = 500

/**
 * Calculate cash referral earning for a given level
 * Tier-aware: small transactions pay flat or nothing, big ones pay full %
 */
export const calcCashReferral = (dmCommission, level) => {
  if (level > 3) return 0
  const tier = getReferralTier(dmCommission)

  if (tier === 'full') {
    const rate = CASH_RATES[level]
    return rate ? Math.round(dmCommission * rate) : 0
  }
  if (tier === 'flat') {
    return FLAT_REFERRAL_AMOUNT
  }
  // points_only tier - no cash at any level
  return 0
}

/**
 * Calculate points for a given level
 */
export const calcPoints = (level) => {
  return POINTS_PER_LEVEL[level] || POINTS_DEFAULT
}

/**
 * Convert points to naira value
 */
export const pointsToCash = (points) => {
  return Math.floor(points / POINTS_TO_CASH_RATE) * POINTS_CASH_VALUE
}

/**
 * Walk up the referral chain from a given user
 * Returns array of { userId, level } up to 10 levels
 */
export const getReferralChain = async (userId) => {
  const chain = []
  let currentId = userId
  let level = 1
  const seen = new Set([userId]) // prevents self-referral / circular invite loops from paying out

  while (currentId && level <= 10) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, invited_by, account_number, account_name, bank_name')
      .eq('id', currentId)
      .single()

    if (!data?.invited_by) break
    if (seen.has(data.invited_by)) break // would be a self-referral or a loop - stop walking
    seen.add(data.invited_by)

    chain.push({
      userId:  data.invited_by,
      level,
      hasBank: !!(data.account_number),
    })

    currentId = data.invited_by
    level++
  }

  return chain
}

/**
 * Process referral payouts when a deal closes
 * Call this from admin panel when marking a deal as complete
 *
 * @param {string} buyerUserId   - the user who completed the transaction
 * @param {number} dmCommission  - DealMatch's commission amount in naira
 * @param {string} transactionId - property/booking/escrow ID
 * @param {string} txType        - 'property_sale'|'rental'|'hotel'|'escrow'|'subscription'
 */
export const processReferralPayouts = async (
  buyerUserId,
  dmCommission,
  transactionId,
  txType = 'property_sale'
) => {
  try {
    const chain = await getReferralChain(buyerUserId)
    if (!chain.length) return { success: true, payouts: [] }

    const payouts = []

    const tier = getReferralTier(dmCommission)

    for (const { userId, level } of chain) {
      // Levels 1-3 in 'full' or 'flat' tier get cash.
      // Levels 1-3 in 'points_only' tier (tiny transactions) fall through to points,
      // same as level 4+, to avoid zero-value cash records.
      if (level <= 3 && tier !== 'points_only') {
        // Cash payout
        const amount = calcCashReferral(dmCommission, level)
        if (amount <= 0) continue

        const { error } = await supabase
          .from('referral_transactions')
          .insert({
            referrer_id:      userId,
            buyer_id:         buyerUserId,
            transaction_id:   transactionId,
            transaction_type: txType,
            dm_commission:    dmCommission,
            referral_level:   level,
            payout_type:      'cash',
            referral_earning: amount,
            status:           'pending',
            created_at:       new Date().toISOString(),
          })

        if (!error) {
          payouts.push({ userId, level, type: 'cash', amount })
          // Automatic notification - no manual lookup needed
          notifyCashReferral(userId, amount, level)
        }
      } else {
        // Points payout
        const points = calcPoints(level)

        // Upsert loyalty points balance
        const { data: existing } = await supabase
          .from('loyalty_points')
          .select('id, points_balance, points_lifetime')
          .eq('user_id', userId)
          .single()

        if (existing) {
          await supabase
            .from('loyalty_points')
            .update({
              points_balance:  existing.points_balance + points,
              points_lifetime: existing.points_lifetime + points,
              updated_at:      new Date().toISOString(),
            })
            .eq('user_id', userId)
        } else {
          await supabase
            .from('loyalty_points')
            .insert({
              user_id:         userId,
              points_balance:  points,
              points_lifetime: points,
              created_at:      new Date().toISOString(),
              updated_at:      new Date().toISOString(),
            })
        }

        // Log the points transaction
        await supabase
          .from('referral_transactions')
          .insert({
            referrer_id:      userId,
            buyer_id:         buyerUserId,
            transaction_id:   transactionId,
            transaction_type: txType,
            dm_commission:    dmCommission,
            referral_level:   level,
            payout_type:      'points',
            points_awarded:   points,
            referral_earning: 0,
            status:           'confirmed',
            created_at:       new Date().toISOString(),
          })

        payouts.push({ userId, level, type: 'points', points })
        // Automatic notification - no manual lookup needed
        notifyPointsAwarded(userId, points, level)
      }
    }

    return { success: true, payouts }
  } catch (err) {
    console.error('Referral payout error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Redeem loyalty points for cash
 * Minimum 100 points. 100 points = ₦10,000
 */
export const redeemPoints = async (userId, pointsToRedeem) => {
  try {
    if (pointsToRedeem < MIN_REDEEM_POINTS) {
      return { success: false, error: 'Minimum redemption is 100 points' }
    }
    if (pointsToRedeem % MIN_REDEEM_POINTS !== 0) {
      return { success: false, error: 'Points must be redeemed in multiples of 100' }
    }

    const { data: loyalty } = await supabase
      .from('loyalty_points')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!loyalty || loyalty.points_balance < pointsToRedeem) {
      return { success: false, error: 'Insufficient points balance' }
    }

    const cashValue = pointsToCash(pointsToRedeem)

    // Deduct points
    await supabase
      .from('loyalty_points')
      .update({
        points_balance:  loyalty.points_balance - pointsToRedeem,
        points_redeemed: (loyalty.points_redeemed || 0) + pointsToRedeem,
        updated_at:      new Date().toISOString(),
      })
      .eq('user_id', userId)

    // Create cash withdrawal record
    await supabase
      .from('referral_transactions')
      .insert({
        referrer_id:      userId,
        payout_type:      'points_redemption',
        points_redeemed:  pointsToRedeem,
        referral_earning: cashValue,
        status:           'pending',
        created_at:       new Date().toISOString(),
      })

    return { success: true, cashValue, pointsRedeemed: pointsToRedeem }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
