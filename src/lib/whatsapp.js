/**
 * WhatsApp notification channel (Communication Platform, Architecture v3
 * Section 6). Previously: WhatsAppButton.jsx only, a manual "chat with
 * support" deep link (wa.me). This adds the other direction -- DealMatch
 * pushing a message TO a user via the WhatsApp Cloud API, the way
 * notifyUser() already pushes email.
 *
 * Never throws -- same never-block principle as notifyUser: a failed
 * WhatsApp send must not block the escrow/job/dispute event that
 * triggered it. Call sites should not await this for anything blocking.
 */
export const sendWhatsAppNotification = async (userId, message) => {
  if (!userId) return
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return // no session -- nothing we can authenticate this send as
    await fetch('/api/send-whatsapp', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId, message }),
    })
  } catch (err) {
    console.error('sendWhatsAppNotification error:', err?.message || err)
  }
}
