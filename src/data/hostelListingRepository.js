// Repository (structural pattern) for listing a student hostel (ListHostelPage).
// The page calls these and never builds a query itself.
import { supabase } from '@/lib/supabase'

export function updateHostel(id, payload) {
  return supabase.from('student_hostels').update(payload).eq('id', id)
}

// New hostels start unpaid. Returns the new row's id.
export function insertHostel(payload) {
  return supabase.from('student_hostels')
    .insert({ ...payload, listing_paid: false })
    .select('id')
    .single()
}
