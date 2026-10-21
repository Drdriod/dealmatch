// Repository (structural pattern) for the sign-up form's uniqueness checks (AuthPage).
// These are database functions that answer yes or no without exposing any account data.
// The pages call these and never build a query.
import { supabase } from '@/lib/supabase'

export function checkPhoneExists(phone) {
  return supabase.rpc('check_phone_exists', { p_phone: phone })
}

export function checkUsernameExists(username) {
  return supabase.rpc('check_username_exists', { p_username: username })
}

// One account per device. Returns rows shaped { exists_count }.
export function checkDeviceExists(fingerprint) {
  return supabase.rpc('check_device_exists', { p_fingerprint: fingerprint })
}

// Phone and username conflicts in one call. The result also carries an email flag,
// which the caller must not show: that would let anyone test whether an email is registered.
export function checkSignupConflicts({ email, phone, username }) {
  return supabase.rpc('check_signup_conflicts', {
    p_email: email,
    p_phone: phone,
    p_username: username,
  })
}
