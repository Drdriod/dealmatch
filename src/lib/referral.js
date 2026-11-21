/**
 * DealMatch referral programme (client side).
 *
 * The rules (levels, rates, tiers, caps, hold days, credits) are NOT in this file. They live in the
 * database table `referral_settings`, are edited in Admin > Referral Settings, and are applied by
 * the database function `record_referral_rewards` when a payment is captured. Nothing here
 * calculates money.
 *
 * What is left here: the agent field fees and the admin call that runs rewards for a completed
 * marketplace job.
 */
import { supabase } from '@/lib/supabase'

export const AGENT_FIELD_FEE   = 3000
export const AGENT_SENIOR_FEE  = 500

/**
 * Run referral rewards for a completed marketplace job. Admin only. The database reads the job's
 * own server-captured commission, applies the live referral settings, and refuses to run twice.
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
