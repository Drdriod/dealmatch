// Repository (structural pattern) for the notification bell.
// Writes of new notifications happen on the server (src/lib/notificationFactory.js).
// This module only reads a user's list and marks rows as read.
import { supabase } from '@/lib/supabase'

export function fetchNotifications(userId, limit = 30) {
  return supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

export function markNotificationsRead(ids) {
  return supabase.from('notifications').update({ read: true }).in('id', ids)
}
