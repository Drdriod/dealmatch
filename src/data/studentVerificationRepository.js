// Repository (structural pattern) for student verification (StudentVerifyPage).
// The page calls these and never builds a query itself.
import { supabase } from '@/lib/supabase'

// The institution list and this student's existing verification, in that order.
export function loadStudentVerifyData(userId) {
  return Promise.all([
    supabase.from('institutions').select('id,name,short_name,state').order('name'),
    supabase.from('student_verifications').select('*').eq('user_id', userId).maybeSingle(),
  ])
}

export function updateStudentVerification(id, payload) {
  return supabase.from('student_verifications').update(payload).eq('id', id)
}

export function insertStudentVerification(payload) {
  return supabase.from('student_verifications').insert(payload)
}

export function saveStudentInstitution(userId, institutionName) {
  return supabase.from('profiles').update({ student_institution: institutionName }).eq('id', userId)
}
