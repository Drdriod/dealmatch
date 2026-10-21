// Repository (structural pattern) for a job and its bids (JobPostingPage). The page calls
// these and never builds a query. Realtime subscriptions stay in the page: they are not queries.
import { supabase } from '@/lib/supabase'

// ── Reviews ──

// The review already left for this job, if any.
export function fetchReviewForTransaction(transactionId) {
  return supabase.from('reviews').select('id, rating').eq('transaction_id', transactionId).maybeSingle()
}

// The database accepts a review only for a COMPLETED job, from the requester, about that
// job's provider (enforce_review_transaction), so a bad call fails there, not here.
export function insertReview({ transactionId, providerId, reviewerId, rating, comment }) {
  return supabase.from('reviews').insert({
    transaction_id: transactionId,
    provider_id:    providerId,
    reviewer_id:    reviewerId,
    rating,
    comment,
  }).select('id, rating').single()
}

// ── The job (a row in transactions) ──

export function fetchTransaction(transactionId) {
  return supabase.from('transactions').select('*').eq('id', transactionId).single()
}

// Posts a new job. The caller supplies the whole row.
export function insertTransaction(row) {
  return supabase.from('transactions').insert(row).select().single()
}

// The provider the requester invited from a provider card, for the preview panel.
export function fetchInvitedProvider(providerId) {
  return supabase.from('profiles')
    .select('id, full_name, avatar_url, city, state')
    .eq('id', providerId)
    .single()
}

// ── Bids ──

// Every bid on the job, newest first, each with its provider's name and photo as
// providerProfile. Resolves to an array. A failed read gives an empty list, as the page
// always treated it.
export async function fetchBidsWithProviders(transactionId) {
  const { data } = await supabase
    .from('bids')
    .select('id, amount_cents, attributes, status, created_at, provider_id')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
  const rows = data || []
  const providerIds = [...new Set(rows.map(b => b.provider_id))]
  let byId = {}
  if (providerIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', providerIds)
    byId = Object.fromEntries((profs || []).map(p => [p.id, p]))
  }
  return rows.map(b => ({ ...b, providerProfile: byId[b.provider_id] }))
}

// ── State changes. Each is a database function that checks who is calling. ──

// Whether the provider has a verified payout account, so money has somewhere to land.
export function hasVerifiedPayoutAccount(providerId) {
  return supabase.rpc('has_verified_payout_account', { p_profile_id: providerId })
}

export function acceptBidForJob(transactionId, bidId) {
  return supabase.rpc('accept_bid', { p_transaction_id: transactionId, p_bid_id: bidId })
}

export function sendCounterOffer(bidId, counterCents) {
  return supabase.rpc('counter_bid', { p_bid_id: bidId, p_counter_cents: counterCents })
}

// Binds a payment reference to the job before Flutterwave opens. It does not mark the job
// funded; the payment webhook does that after verifying the payment.
export function startEscrowPayment(transactionId, reference) {
  return supabase.rpc('start_escrow_payment', { p_transaction_id: transactionId, p_reference: reference })
}

// Refused by the database once the job is funded: that has to go through disputes.
export function cancelTransaction(transactionId, reason) {
  return supabase.rpc('cancel_transaction', { p_transaction_id: transactionId, p_reason: reason })
}

// Each side confirms the job is done. The job completes when both have.
export function confirmTransaction(transactionId, asRequester) {
  return supabase.rpc(
    asRequester ? 'confirm_transaction_buyer' : 'confirm_transaction_provider',
    { p_transaction_id: transactionId }
  )
}
