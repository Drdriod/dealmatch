// Talks to the staging database. Used only on the tester Preview (VITE_TEST_MODE=true).
import { supabase } from '@/lib/supabase'

export async function submitReport(row) {
  const { error } = await supabase.from('test_reports').insert(row)
  if (error) throw new Error(error.message || 'Could not send the report')
}

export async function saveProgress(seat, done) {
  const { error } = await supabase.rpc('test_save_progress', {
    p_code: seat.code,
    p_seat: `${seat.seat} ${seat.title}`,
    p_done: done,
    p_total: seat.steps.length,
  })
  if (error) throw new Error(error.message || 'Could not save progress')
}

export async function fetchFeed(key) {
  const { data, error } = await supabase.rpc('test_feed', { p_key: key })
  if (error) throw new Error(error.message || 'Could not load the feed')
  return data || { reports: [], progress: [] }
}
