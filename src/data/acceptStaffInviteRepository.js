// Repository (structural pattern) for accepting a staff invite (AcceptStaffInvitePage).
import { supabase } from '@/lib/supabase'

// Turns the signed-in user's pending invite into a staff role. The database function
// checks the invite against the caller's email, so the page passes no arguments.
export function acceptStaffInvite() {
  return supabase.rpc('accept_staff_invite')
}
