// ============================================================================
// Platform fees: the app reads every fee from the platform_fees table, so the
// super admin page is the only place a fee is changed. Nothing here hardcodes
// a rate. Pages call usePlatformFees() and wait for `fees` before showing a
// price, so a stale number is never displayed.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Whole percent or naira, formatted the same way format_platform_fee() does
// in the database, so the app and the notifications read the same.
export function formatPlatformFee(fee) {
  if (!fee) return ''
  if (fee.kind === 'percent') {
    const n = Number(fee.value)
    return `${Number.isInteger(n) ? n : n.toString().replace(/0+$/, '').replace(/\.$/, '')}%`
  }
  return `₦${Math.round(Number(fee.value)).toLocaleString('en-NG')}`
}

// The numeric value for a channel, or null if it is missing or switched off.
// Use this in calculations. A null here means the page must not charge.
export function feeValue(fees, key) {
  const row = fees?.[key]
  if (!row || !row.is_active) return null
  return Number(row.value)
}

// Fetch every channel, keyed by key. Anyone can read these rows (RLS allows it).
export async function fetchPlatformFees() {
  const { data, error } = await supabase
    .from('platform_fees')
    .select('key,label,description,area,kind,value,is_active,updated_at')
    .order('area')
    .order('label')
  if (error) throw error
  const map = {}
  for (const row of data || []) map[row.key] = row
  return map
}

// React hook. `fees` is null until the first load finishes.
export function usePlatformFees() {
  const [fees, setFees] = useState(null)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      setFees(await fetchPlatformFees())
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { fees, error, reload }
}
