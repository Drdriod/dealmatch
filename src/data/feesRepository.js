import { supabase } from '@/lib/supabase';

// ASSUMED column names for the platform_fees registry. Verify and adjust this one constant.
const FEE_COLUMNS = 'fee_key, label, amount_kobo';

export async function listContactFees() {
  const { data, error } = await supabase.from('platform_fees').select(FEE_COLUMNS).order('amount_kobo', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
