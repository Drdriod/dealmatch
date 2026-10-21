// Repository for dynamic virtual accounts, used by the payment API (api/platform.js).
// Writes and lookups take the service-role client. findPaymentStatus takes the
// payer's own client, so the database's row-level security limits what it can see.

export function findVirtualAccountByReference(svc, reference) {
  return svc.from('payment_virtual_accounts')
    .select('*')
    .eq('reference', reference)
    .maybeSingle()
}

// The customer id from the newest virtual account opened with this email. Flutterwave
// rejects a second customer with the same email, so the id is reused.
export function findCustomerIdForEmail(svc, email) {
  return svc.from('payment_virtual_accounts')
    .select('customer_id')
    .eq('email', email)
    .not('customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

export function insertVirtualAccount(svc, row) {
  return svc.from('payment_virtual_accounts').insert(row)
}

// The payer's own row, for the status poll. Pass the user-scoped client.
export function findPaymentStatus(userClient, reference) {
  return userClient.from('payment_virtual_accounts')
    .select('reference, status, expected_kobo, paid_kobo, paid_at, profile_id')
    .eq('reference', reference)
    .maybeSingle()
}
