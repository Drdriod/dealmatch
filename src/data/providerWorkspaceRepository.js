import { supabase } from '@/lib/supabase';

// identity_verification_status is the column the verification flow already writes.
const PROFILE_COLUMNS = 'id, full_name, avatar_url, identity_verification_status';

export async function getProviderProfile(userId) {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
