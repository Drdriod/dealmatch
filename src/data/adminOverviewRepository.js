// Repository (structural pattern) for the admin Overview and Analytics tabs:
// the command-centre panels and the fallback figures used when the stats API is
// unavailable. Command-centre panels fail on their own, so one broken query
// blanks only its panel.
import { supabase } from '@/lib/supabase'

const countOf = (table, apply) =>
  Promise.resolve(apply(supabase.from(table).select('*', { count: 'exact', head: true })))
    .then(r => r.error ? null : (r.count ?? 0)).catch(() => null)

const rowsOf = (table, cols, apply) =>
  Promise.resolve(apply(supabase.from(table).select(cols, { count: 'exact' })))
    .then(r => r.error ? null : { rows: r.data || [], total: r.count ?? 0 }).catch(() => null)

// Queue counts, listing mix, 30-day series, and recent payments, from the given start time.
export function fetchCommandCentre(since) {
  return Promise.all([
    countOf('properties', q => q.eq('status', 'active')),
    countOf('properties', q => q.eq('status', 'pending_review')),
    countOf('properties', q => q.eq('status', 'paused')),
    countOf('properties', q => q.eq('status', 'sold')),
    countOf('properties', q => q.eq('status', 'rejected')),
    countOf('student_verifications', q => q.eq('status', 'pending')),
    countOf('complaints', q => q.in('status', ['open', 'escalated'])),
    countOf('payout_queue', q => q.eq('status', 'failed')),
    countOf('withdrawal_requests', q => q.eq('status', 'pending')),
    countOf('payout_accounts', q => q.eq('status', 'pending')),
    rowsOf('profiles', 'created_at', q => q.gte('created_at', since)),
    rowsOf('properties', 'created_at', q => q.gte('created_at', since)),
    rowsOf('payments', 'amount,created_at', q => q.eq('status', 'success').gte('created_at', since)),
    supabase.from('payments').select('id,amount,payment_type,status,created_at')
      .order('created_at', { ascending: false }).limit(6)
      .then(r => r.error ? [] : (r.data || [])).catch(() => []),
  ]).then(v => ({
    mix: { active: v[0], pending_review: v[1], paused: v[2], sold: v[3], rejected: v[4] },
    studentIds: v[5], complaints: v[6], failedPayouts: v[7], withdrawals: v[8], bankAccounts: v[9],
    signups: v[10], listings: v[11], payments: v[12], recentPayments: v[13],
  })).catch(() => null)
}

// Overview KPI strip, used only when the stats API fails.
export async function fetchOverviewFallback() {
  const [{count:u},{count:a},{count:p},{data:pay},{data:rp}] = await Promise.all([
    supabase.from('profiles').select('*',{count:'exact',head:true}),
    supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','active'),
    supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','pending_review'),
    supabase.from('payments').select('amount').eq('status','success'),
    supabase.from('properties').select('id,title,status,created_at,profiles(full_name)').order('created_at',{ascending:false}).limit(6),
  ])
  return {
    stats: { totalUsers: u, activeListings: a, pendingListings: p,
      totalRevenue: (pay || []).reduce((s, x) => s + (x.amount || 0), 0) },
    recent: rp || [],
  }
}

// Analytics figures, used only when the stats API fails.
export async function fetchAnalyticsFallback() {
  const [{count:tu},{count:tp},{count:ap},{count:pp},{count:tpr},{count:apr},{count:ma},{count:et},{data:pd},{count:re},{count:pi}] = await Promise.all([
    supabase.from('profiles').select('*',{count:'exact',head:true}),
    supabase.from('properties').select('*',{count:'exact',head:true}),
    supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','active'),
    supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','pending_review'),
    supabase.from('professional_applications').select('*',{count:'exact',head:true}),
    supabase.from('professional_applications').select('*',{count:'exact',head:true}).eq('status','approved'),
    supabase.from('mortgage_applications').select('*',{count:'exact',head:true}),
    supabase.from('escrow_transactions').select('*',{count:'exact',head:true}),
    supabase.from('payments').select('amount').eq('status','success'),
    supabase.from('rental_enquiries').select('*',{count:'exact',head:true}),
    supabase.from('profiles').select('*',{count:'exact',head:true}).eq('identity_verification_status','submitted'),
  ])
  return {
    totalUsers: tu, totalProps: tp, activeListings: ap, pendingListings: pp,
    totalPros: tpr, activePros: apr, mortgageApps: ma, escrowTxns: et,
    totalRevenue: (pd || []).reduce((s, p) => s + (p.amount || 0), 0),
    rentalEnquiries: re, pendingIdentity: pi,
  }
}

// Counts for the sidebar badges: identity submissions, listings to review, and student IDs to review.
export async function fetchSidebarBadgeCounts() {
  const [{count:identity},{count:properties},{count:students}] = await Promise.all([
    supabase.from('profiles').select('*',{count:'exact',head:true}).eq('identity_verification_status','submitted'),
    supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','pending_review'),
    supabase.from('student_verifications').select('*',{count:'exact',head:true}).eq('status','pending'),
  ])
  return { identity, properties, 'student-verifications': students }
}
