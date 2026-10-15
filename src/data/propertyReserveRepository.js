// Repository (structural pattern) for reserving a property under escrow (PropertyReserveModal).
// The component calls these and never builds a query. The payment itself opens through
// the payment gateway, not here.
import { supabase } from '@/lib/supabase'

// Creates the escrow row for this payment reference before the payment opens, so the payment
// webhook can find it by reference. Resolves with the new escrow row. The caller supplies the
// arguments in the database function's own names.
export function startPropertyEscrowPayment({ propertyId, reference, transactionType, grossAmount, tenantName, tenantPhone, moveInDate }) {
  return supabase.rpc('start_property_escrow_payment', {
    p_property_id:      propertyId,
    p_reference:        reference,
    p_transaction_type: transactionType,
    p_gross_amount:     grossAmount,
    p_tenant_name:      tenantName,
    p_tenant_phone:     tenantPhone,
    p_move_in_date:     moveInDate,
  })
}

// The current status of one escrow row, polled while the payment is confirmed.
export function fetchEscrowStatus(escrowId) {
  return supabase.from('escrow_transactions').select('status').eq('id', escrowId).single()
}
