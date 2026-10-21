// Repository (structural pattern) for the admin Payouts tab: payout accounts,
// the payout queue, withdrawal requests, and the staff actions on them. Actions
// that change money go through database functions (RPCs) that check the role.
import { supabase } from '@/lib/supabase'

export function fetchPayoutAccounts() {
  return supabase.from('payout_accounts')
    .select('id,profile_id,bank_name,bank_code,account_number,account_name,status,gateway_recipient_code,created_at')
    .in('status', ['pending', 'verified', 'rejected'])
    .order('created_at', { ascending: false }).limit(100)
}

export function fetchPayoutQueue() {
  return supabase.from('payout_queue')
    .select('id,transaction_id,profile_id,amount_cents,status,gateway_ref,attempts,failure_reason,created_at,processed_at')
    .order('created_at', { ascending: false }).limit(100)
}

export function fetchWithdrawalRequests() {
  return supabase.from('withdrawal_requests')
    .select('id,profile_id,amount_cents,status,requested_at')
    .order('requested_at', { ascending: false }).limit(100)
}

// Name and email for a set of profiles. Used instead of an embed, because
// profile_id on these tables references auth.users, not profiles.
export function fetchProfileSummaries(ids) {
  return supabase.from('profiles').select('id,full_name,email').in('id', ids)
}

export function verifyPayoutAccount(id) {
  return supabase.rpc('verify_payout_account', { p_id: id })
}

export function rejectPayoutAccount(id, reason) {
  return supabase.rpc('reject_payout_account', { p_id: id, p_reason: reason })
}

// Resets a failed queue row to pending with attempts kept, so the next cron run picks it up.
// The cron processor's own attempt ceiling still applies. Only a failed row moves (failed to
// pending is the one move an admin may make; the database trigger enforces the same table), and
// the write returns the rows it changed, so the page can tell when the row had already moved on.
export function requeuePayout(id) {
  return supabase.from('payout_queue')
    .update({ status: 'pending', failure_reason: null })
    .eq('id', id).eq('status', 'failed')
    .select('id')
}

export function fulfillWithdrawal(requestId) {
  return supabase.rpc('fulfill_withdrawal_request', { p_request_id: requestId })
}

export function rejectWithdrawal(requestId) {
  return supabase.rpc('reject_withdrawal_request', { p_request_id: requestId })
}
