// Repository (structural pattern) for the Messages page and its review and
// dispute dialogs. Every function returns the Supabase { data, error } result,
// so callers keep their existing handling.
import { supabase } from '@/lib/supabase'

export function createPropertyReview({ propertyId, reviewerId, reviewerName, landlordId, rating, text }) {
  return supabase.from('property_reviews').insert({
    property_id:   propertyId,
    reviewer_id:   reviewerId,
    reviewer_name: reviewerName,
    landlord_id:   landlordId,
    rating,
    review_text:   text || null,
  })
}

export function createDispute({ propertyId, reporterId, againstId, bookingId, reason, description }) {
  return supabase.from('disputes').insert({
    property_id:  propertyId,
    reporter_id:  reporterId,
    against_id:   againstId,
    booking_id:   bookingId || null,
    reason,
    description,
    status:       'open',
  })
}

// Every message in one thread, oldest first.
export function fetchThreadMessages(threadId) {
  return supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
}

// Marks the messages sent to this user in a thread as read.
export function markThreadRead(threadId, userId) {
  return supabase.from('messages').update({ read: true })
    .eq('thread_id', threadId).eq('recipient_id', userId)
}

export function sendThreadMessage({ threadId, senderId, senderName, recipientId, propertyId, content }) {
  return supabase.from('messages').insert({
    thread_id:     threadId,
    sender_id:     senderId,
    sender_name:   senderName,
    recipient_id:  recipientId,
    property_id:   propertyId,
    content,
  })
}

// The user's messages (sent or received), newest first. The page keeps the
// first message of each thread.
export function fetchUserMessages(userId) {
  return supabase
    .from('messages')
    .select('thread_id, content, created_at, sender_id, sender_name, recipient_id, property_id, read')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
}

export function fetchPropertyTitles(propertyIds) {
  return supabase.from('properties').select('id, title, seller_id').in('id', propertyIds)
}
