// Repository (structural pattern) for the admin list tabs: announcements, rental
// enquiries, mortgage applications, the deal pipeline, payments and escrow
// transactions, properties, professional applications and student hostels.
// Staff roles and RLS are checked in the database. Status changes are plain
// updates here, and callers record the audit entry themselves.
import { supabase } from '@/lib/supabase'

// ── Announcements ──
export function fetchAnnouncements() {
  return supabase.from('admin_announcements').select('*').order('created_at', { ascending: false }).limit(50)
}

export function insertAnnouncement({ title, body, type, target, adminId }) {
  return supabase.from('admin_announcements').insert({
    title, body, type, target, created_by: adminId, created_at: new Date().toISOString(),
  })
}

// ── Rental enquiries ──
export function fetchRentalEnquiries() {
  return supabase.from('rental_enquiries')
    .select('*,properties(title,state,city,listing_type)')
    .order('created_at', { ascending: false }).limit(200)
}

// ── Mortgage applications ──
export function fetchMortgageApplications(filter) {
  let q = supabase.from('mortgage_applications')
    .select('*,profiles(full_name,email,phone)')
    .order('created_at', { ascending: false }).limit(200)
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}

export function setMortgageStatus(id, status) {
  return supabase.from('mortgage_applications')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
}

// ── Deal pipeline ──
export function fetchDealPipeline() {
  return supabase.from('admin_deal_pipeline').select('*')
    .order('created_at', { ascending: false }).limit(300)
}

// ── Payments and escrow ──
export function fetchPayments() {
  return supabase.from('payments')
    // payments has no payment_type column. professional_type and plan_type are what the webhook stores.
    .select('id,reference,amount,professional_type,plan_type,email,status,created_at')
    .order('created_at', { ascending: false }).limit(200)
}

// Aliases match the columns the page reads. The embed names the seller explicitly,
// because escrow_transactions has four foreign keys to profiles.
export function fetchEscrowTransactionsForAdmin() {
  return supabase.from('escrow_transactions')
    .select('id,amount:gross_amount,platform_fee:platform_amount,status,payment_ref,created_at,properties(title),profiles:profiles!escrow_transactions_seller_id_fkey(full_name)')
    .order('created_at', { ascending: false }).limit(200)
}

// ── Properties ──
export function fetchProperties(filter) {
  let q = supabase.from('properties')
    .select('id,title,category,listing_type,price,status,state,city,created_at,profiles(full_name,email)')
    .order('created_at', { ascending: false }).limit(200)
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}

// Verified fields are set only when the listing goes active.
export function setPropertyStatus(id, { status, adminId }) {
  const now = new Date().toISOString()
  return supabase.from('properties').update({
    status, verified_by: adminId, verified_at: status === 'active' ? now : null, updated_at: now,
  }).eq('id', id)
}

// ── Professional applications ──
export function fetchProfessionalApplications(filter) {
  let q = supabase.from('professional_applications')
    .select('id,full_name,email,phone,professional_type,company_name,plan_type,rating,review_count,status,created_at,coverage_areas')
    .order('created_at', { ascending: false }).limit(200)
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}

// Moving to 'active' approves the application and stamps activation time.
export function setProfessionalStatus(id, status) {
  return supabase.from('professional_applications').update({
    status: status === 'active' ? 'approved' : status,
    activated_at: status === 'active' ? new Date().toISOString() : null,
  }).eq('id', id)
}

// ── Student hostels ──
export function fetchStudentHostels(filter) {
  let q = supabase.from('student_hostels')
    .select('id,title,city,state,institution_name,room_type,price_per_year,rooms_available,status,listing_paid,verified,created_at,profiles(full_name,email)')
    .order('created_at', { ascending: false }).limit(200)
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}

export function updateStudentHostel(id, updates) {
  return supabase.from('student_hostels').update(updates).eq('id', id)
}

// ── Deals ──
// The database function cancels the job and its escrow, and records the reason.
export function cancelDeal(transactionId, reason) {
  return supabase.rpc('cancel_transaction', { p_transaction_id: transactionId, p_reason: reason })
}
