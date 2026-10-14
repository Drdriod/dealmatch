// Repository (structural pattern) for the Wallet page.
//
// The page calls these and never builds a query itself. loadWalletData returns
// the seven results in the same order the page has always destructured them,
// so the page's state handling does not change.
import { supabase } from '@/lib/supabase'

export function loadWalletData(userId) {
  return Promise.all([
    supabase.from('escrow_transactions')
      .select('id, property_id, status, gross_amount, transaction_type, buyer_id, seller_id, tenant_id, confirmed_at')
      .or(`tenant_id.eq.${userId},buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('confirmed_at', { ascending: false, nullsFirst: false })
      .limit(50),
    supabase.from('transactions')
      .select('id, status, amount_cents, model, requester_id, provider_id, created_at')
      .or(`requester_id.eq.${userId},provider_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('referral_transactions')
      .select('amount, status')
      .eq('referrer_id', userId)
      .in('status', ['confirmed', 'paid_out']),
    supabase.from('loyalty_points').select('balance').eq('user_id', userId).single(),
    supabase.from('commission_wallet_ledger')
      .select('id, transaction_id, entry_type, amount_cents, occurred_at, transactions(description)')
      .eq('profile_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase.from('withdrawal_requests')
      .select('id, amount_cents, status, requested_at')
      .eq('profile_id', userId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1),
    supabase.from('payout_accounts')
      .select('id, status, bank_name')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
}

// Asks for a withdrawal of the whole available balance. The database checks the
// amount and records the request.
export function requestWithdrawal(amountCents) {
  return supabase.rpc('request_withdrawal', { p_amount_cents: amountCents })
}
