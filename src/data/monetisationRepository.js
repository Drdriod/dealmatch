// Repository (structural pattern) for the super admin Monetisation tab.
//
// The only module that talks to the database for this tab. The page asks for
// what it needs and receives plain values. It never builds a query or names a
// table or RPC itself, so a schema change touches this file only.
//
// Each function returns { data, error } as Supabase does, so callers keep the
// same error handling they had before.
import { supabase } from '@/lib/supabase'

export function fetchFeeHistory(limit = 25) {
  return supabase
    .from('platform_fee_history')
    .select('fee_key,old_value,new_value,old_active,new_active,note,changed_at')
    .order('changed_at', { ascending: false })
    .limit(limit)
}

export function fetchPendingRefunds() {
  return supabase
    .from('payment_refunds')
    .select('id,reason,payer_email,reference,amount_kobo,status,note,dedupe_key,created_at')
    .eq('status', 'to_refund')
    .order('created_at', { ascending: true })
}

// Records that money was sent back to a payer. Requires the bank reference.
export function markRefundReturned(id, bankReference) {
  return supabase.rpc('mark_payment_refunded', { p_id: id, p_bank_reference: bankReference })
}

// Changes a channel's rate or value, and whether it is on. Every user is notified.
export function setPlatformFee({ key, value, isActive, note }) {
  return supabase.rpc('admin_set_platform_fee', {
    p_key: key,
    p_value: value,
    p_is_active: !!isActive,
    p_note: note?.trim() || null,
  })
}

// Adds a new channel to the registry.
export function createPlatformFee({ key, label, area, kind, value, description }) {
  return supabase.rpc('admin_create_platform_fee', {
    p_key: key.trim(),
    p_label: label.trim(),
    p_area: area,
    p_kind: kind,
    p_value: Number(value) || 0,
    p_description: description?.trim() || null,
  })
}
