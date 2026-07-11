// /api/send-email - Transactional email sender (Resend)
// Used for referral payout / points award notifications.
// Requires RESEND_API_KEY env var. If not configured, fails silently
// (in-app notifications still work - email is a non-critical bonus channel).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Not configured yet - don't break the calling flow, just report it
    console.warn('RESEND_API_KEY not set - skipping email send')
    return res.status(200).json({ sent: false, reason: 'not_configured' })
  }

  const { to, name, subject, message } = req.body || {}

  if (!to || !subject || !message) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'DealMatch <notifications@dealmatch.com.ng>',
        to:      [to],
        subject: subject,
        html: '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">'
            + '<h2 style="color: #1A1210;">Hi ' + (name || 'there') + ',</h2>'
            + '<p style="color: #5C4A3A; font-size: 15px; line-height: 1.6;">' + message + '</p>'
            + '<a href="https://www.dealmatch.com.ng/referral" '
            + 'style="display:inline-block; margin-top:16px; padding:12px 24px; '
            + 'background-color:#C96A3A; color:#fff; text-decoration:none; '
            + 'border-radius:12px; font-weight:600;">View on DealMatch</a>'
            + '<p style="color: #8A7E78; font-size: 12px; margin-top: 32px;">DealMatch Technology Limited · Uyo, Akwa Ibom, Nigeria</p>'
            + '</div>',
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Resend API error:', errText)
      return res.status(200).json({ sent: false, reason: 'provider_error' })
    }

    return res.status(200).json({ sent: true })

  } catch (err) {
    console.error('send-email error:', err.message)
    // Never 500 here - email is a non-critical bonus channel
    return res.status(200).json({ sent: false, reason: err.message })
  }
}
