// Repository (structural pattern) for paying to unlock a contact (UnlockContactButton).
// The component calls these and never builds a query. Buying a credit pack goes through
// the payment gateway, not here.
import { supabase } from '@/lib/supabase'
import { fetchPropertyContact } from '@/data/propertyDetailRepository'

// How many unlock credits the signed-in user has. Resolves to a number.
export function fetchUnlockCreditBalance() {
  return supabase.rpc('get_unlock_credit_balance')
}

// The contact details, if the database lets this user see them. It decides, so an empty result
// means "not unlocked", not an error. targetType is 'property' or anything else for a provider.
export function fetchUnlockedContact(targetType, targetId) {
  return targetType === 'property'
    ? fetchPropertyContact(targetId)
    : supabase.rpc('get_provider_contact', { p_provider_id: targetId })
}

// Spends one credit to unlock a target. The database checks the balance and records the unlock.
export function spendUnlockCredit(targetType, targetId) {
  return supabase.rpc('spend_unlock_credit', { p_target_type: targetType, p_target_id: String(targetId) })
}
