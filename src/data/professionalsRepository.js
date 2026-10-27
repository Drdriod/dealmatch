// Repository (structural pattern) for professional applications: the application form
// (ApplyProfessionalPage) calls this and never builds a query. The old public directory page was
// removed, along with its read of every application column.
import { supabase } from '@/lib/supabase'

// A new application to be listed. The caller supplies the whole row; resolves with the new id.
export function insertProfessionalApplication(row) {
  return supabase.from('professional_applications').insert(row).select('id').single()
}
