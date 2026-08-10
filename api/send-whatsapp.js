/**
 * POST /api/send-whatsapp
 * Body: { phone: "2348012345678", message: "..." }
 *
 * Sends a text message via Meta's WhatsApp Cloud API. This is the piece
 * that was "designed, no code" -- WhatsAppButton.jsx already links users
 * TO DealMatch's WhatsApp via wa.me; this is DealMatch pushing a message
 * back OUT, which is what escrow.funded / dispute.opened need.
 *
 * Requires two environment variables in Vercel:
 *   WHATSAPP_CLOUD_API_TOKEN   -- permanent or long-lived access token
 *   WHATSAPP_PHONE_NUMBER_ID   -- the Cloud API phone_number_id (not the
 *                                  human-readable number)
 *
 * Note on Cloud API rules: this sends a free-form text message, which
 * Meta only delivers if the recipient messaged the business within the
 * last 24 hours (the "customer service window"). Outside that window,
 * free-form sends are silently rejected and you must use a pre-approved
 * message template instead. For DealMatch's escrow/dispute notifications,
 * that means: fine for a provider who's actively chatting via
 * WhatsAppButton, NOT reliable as the only channel for someone who never
 * opened WhatsApp with DealMatch -- keep the email fallback in
 * notifications.js as the guaranteed path, treat this as a bonus channel
 * until template messages are set up.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { phone, message } = req.body || {}
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' })
  }

  const token       = process.env.WHATSAPP_CLOUD_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    console.error('send-whatsapp: WHATSAPP_CLOUD_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set')
    // Non-fatal to the caller -- the event that triggered this should not
    // fail just because the WhatsApp channel isn't configured yet.
    return res.status(200).json({ sent: false, reason: 'whatsapp not configured' })
  }

  const to = String(phone).replace(/\D/g, '')

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      }
    )

    const data = await resp.json()

    if (!resp.ok) {
      console.error('send-whatsapp: Cloud API error', data)
      return res.status(200).json({ sent: false, reason: data?.error?.message || 'cloud api error' })
    }

    return res.status(200).json({ sent: true, id: data?.messages?.[0]?.id })
  } catch (err) {
    console.error('send-whatsapp error:', err.message)
    return res.status(200).json({ sent: false, reason: 'network error' })
  }
}
