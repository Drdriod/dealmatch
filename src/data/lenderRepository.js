// Repository (structural pattern) for the lender dashboard: mortgage applications
// a lender user reviews and moves through the pipeline. Access is enforced by RLS
// (roles lender, admin, superadmin); this module only shapes the queries.
import { supabase } from '@/lib/supabase'

// Applications, newest first. Pass a status to filter, or null for all.
export function fetchApplications(status = null) {
  let query = supabase.from('mortgage_applications')
    .select('*')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  return query
}

// The narrower set the funnel and charts need.
export function fetchPipeline() {
  return supabase.from('mortgage_applications')
    .select('id, ticket_id, full_name, status, property_value, down_payment, property_state, created_at, updated_at')
    .order('created_at', { ascending: false })
}

export function updateApplicationStatus(applicationId, { status, notes }) {
  return supabase.from('mortgage_applications')
    .update({ status, notes, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
}
