// Repository (structural pattern) for the payout account page (PayoutSetupPage).
// The page calls these and never builds a query itself.
import { supabase } from '@/lib/supabase'

// The provider's most recent payout account, or null.
export function fetchLatestPayoutAccount(userId) {
  return supabase.from('payout_accounts')
    .select('id, gateway, bank_name, bank_code, account_number, account_name, status, rejected_reason, created_at')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

// Submits bank details for manual review. The database function creates the row as pending.
export function submitPayoutAccount({ bankName, accountNumber, accountName, bankCode }) {
  return supabase.rpc('submit_payout_account', {
    p_bank_name: bankName,
    p_account_number: accountNumber,
    p_account_name: accountName,
    p_bank_code: bankCode,
  })
}
