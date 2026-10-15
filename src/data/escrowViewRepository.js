// Repository (structural pattern) for the tenant's escrow view (EscrowPage).
// The page calls these and never builds a query itself.
import { supabase } from '@/lib/supabase'

// Funded escrows for this tenant, newest first, with the property name and city.
export function fetchFundedEscrowsForTenant(userId) {
  return supabase.from('escrow_transactions')
    .select('*,properties(title,city)')
    .eq('tenant_id', userId)
    .eq('status', 'funded')
    .order('created_at', { ascending: false })
}

// The tenant confirms move-in on their own escrow. The database releases the funds.
export function recordMoveInConfirmation(escrowId, userId) {
  return supabase.from('escrow_transactions')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('id', escrowId)
    .eq('tenant_id', userId)
}
