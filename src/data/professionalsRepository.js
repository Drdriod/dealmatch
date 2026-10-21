// Repository (structural pattern) for professionals: the public directory
// (ProfessionalsPage) and the application form (ApplyProfessionalPage). The pages call
// these and never build a query.
import { supabase } from '@/lib/supabase'

// Approved professionals, newest first. Pass 'all' for every type, or one professional_type.
export function fetchApprovedProfessionals(typeFilter) {
  let q = supabase
    .from('professional_applications')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (typeFilter !== 'all') q = q.eq('professional_type', typeFilter)
  return q
}

// A visitor asks a professional to contact them. The caller supplies the whole row.
export function insertProfessionalRequest(row) {
  return supabase.from('professional_requests').insert(row)
}

// A new application to be listed. The caller supplies the whole row; resolves with the new id.
export function insertProfessionalApplication(row) {
  return supabase.from('professional_applications').insert(row).select('id').single()
}
