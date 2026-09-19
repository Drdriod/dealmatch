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
 * Process referral payouts when a deal closes.
 *
 * This used to compute amounts in the browser and write them directly to
 * loyalty_points/referral_transactions - trusting whatever dmCommission the
 * caller passed in, with only row-ownership RLS as a gate. It now calls a
 * SECURITY DEFINER RPC that reads the transaction's own immutable,
 * server-captured commission_amount_cents and does the entire chain walk
 * and crediting inside the database. The RPC is admin-only and refuses to
 * run twice for the same transaction.
 *
 * @param {number|string} transactionId - a public.transactions.id (BIGINT)
 */
export const processReferralPayoutsForTransaction = async (transactionId) => {
  const { data, error } = await supabase.rpc('process_referral_payouts_for_transaction', {
    p_transaction_id: transactionId,
  })
  if (error) return { success: false, error: error.message }
  return { success: true, payoutsMade: data }
}

/**
 * Redeem loyalty points for cash.
 * Minimum 100 points. 100 points = ₦10,000.
 *
 * This now calls a SECURITY DEFINER RPC that locks the caller's own
 * loyalty_points row, validates the balance, and computes the cash value
 * server-side, instead of the previous read-then-write from the browser
 * (which was also, separately, silently failing to log the redemption at
 * all - referral_transactions.referee_id/deal_amount/platform_fee are
 * NOT NULL columns the old insert never set).
 */
export const redeemPoints = async (userId, pointsToRedeem) => {
  if (pointsToRedeem < MIN_REDEEM_POINTS) {
    return { success: false, error: 'Minimum redemption is 100 points' }
  }
  if (pointsToRedeem % MIN_REDEEM_POINTS !== 0) {
    return { success: false, error: 'Points must be redeemed in multiples of 100' }
  }

  const { data, error } = await supabase.rpc('redeem_loyalty_points', { p_points: pointsToRedeem })
  if (error) return { success: false, error: error.message }

  const row = Array.isArray(data) ? data[0] : data
  return { success: true, cashValue: row?.cash_value ?? pointsToCash(pointsToRedeem), pointsRedeemed: pointsToRedeem }
}
