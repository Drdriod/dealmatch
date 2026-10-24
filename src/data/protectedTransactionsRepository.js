import { supabase } from '@/lib/supabase';

const COLUMNS =
  'ref, source, source_id, purpose, title, buyer_id, provider_id, amount_kobo, currency, display_state, buyer_confirmed, provider_confirmed, terms_version, terms_snapshot, agreed_at, created_at, updated_at';
const EVENT_COLUMNS = 'id, transaction_ref, event_type, actor_id, actor_role, note, created_at';

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function getProtectedTransaction(ref) {
  return check(await supabase.from('protected_transactions').select(COLUMNS).eq('ref', ref).maybeSingle());
}

export async function listTransactionEvents(ref) {
  return check(
    await supabase.from('transaction_events').select(EVENT_COLUMNS).eq('transaction_ref', ref).order('created_at', { ascending: true }),
  );
}

export async function listProviderTransactions(providerId) {
  return check(
    await supabase
      .from('protected_transactions')
      .select(COLUMNS)
      .eq('provider_id', providerId)
      .order('updated_at', { ascending: false })
      .limit(200),
  );
}

// Parameter name p_transaction_id is assumed from the v31 dual-confirmation functions. Verify.
export async function confirmCompletion({ sourceId, role }) {
  const fn = role === 'customer' ? 'confirm_transaction_buyer' : 'confirm_transaction_provider';
  const { error } = await supabase.rpc(fn, { p_transaction_id: sourceId });
  if (error) throw new Error(error.message);
}
