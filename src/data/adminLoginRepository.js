// Repository (structural pattern) for the staff sign-in screen (AdminLoginPage).
// The page calls these and never builds a query. Password sign-in, sign-out and password
// reset are auth calls and stay in the page.
import { supabase } from '@/lib/supabase'

// The real lockout, backed by the admin_login_attempts table. Resolves true while this email
// is locked out. The page's own counter is only a hint and resets in a new tab.
export function isAdminLoginLocked(email) {
  return supabase.rpc('is_admin_login_locked', { p_email: email })
}

// Records one sign-in attempt, successful or not, so the lockout can count failures.
export function recordAdminLoginAttempt(email, success) {
  return supabase.rpc('record_admin_login_attempt', { p_email: email, p_success: success })
}

// The signed-in user's role and name, used to decide whether they may enter and where to send them.
export function fetchStaffProfile(userId) {
  return supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', userId)
    .single()
}
