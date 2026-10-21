// Repository (structural pattern) for reporting a listing or person (ReportModal).
import { supabase } from '@/lib/supabase'

// Files a report for staff to review. The caller supplies the whole row.
export function insertReport(row) {
  return supabase.from('reports').insert(row)
}
