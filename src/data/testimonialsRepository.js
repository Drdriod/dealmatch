// Repository (structural pattern) for customer stories (TestimonialsSection).
// The component calls these and never builds a query.
import { supabase } from '@/lib/supabase'

// The nine newest approved stories, for the public section.
export function fetchApprovedTestimonials() {
  return supabase
    .from('testimonials')
    .select('id, name, role_label, content, rating, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(9)
}

// The signed-in user's own story status ('pending', 'approved' or 'rejected'), if they have one.
export function fetchOwnTestimonialStatus(userId) {
  return supabase.from('testimonials').select('status').eq('user_id', userId).maybeSingle()
}

// Submits a story for review. The caller supplies the whole row.
export function insertTestimonial(row) {
  return supabase.from('testimonials').insert(row)
}

// The user's newest story that was not rejected, if any. Used to tell "you already have one"
// apart from a different row security failure when an insert is refused.
export function findOwnLiveTestimonial(userId) {
  return supabase
    .from('testimonials')
    .select('status')
    .eq('user_id', userId)
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
    .maybeSingle()
}
