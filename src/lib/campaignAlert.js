// Email alert to the address set on a campaign page when a new enquiry arrives.
// Server only. A failure is logged and never blocks saving the enquiry: the enquiry is
// already in the database and in the admin Campaigns tab.
import { escapeHtml } from './campaign.js'

export async function sendLeadAlert({ to, pageTitle, lead, fetchImpl = fetch }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !to) return { sent: false, reason: 'not_configured' }
  const row = (label, value) => value
    ? `<tr><td style="padding:4px 12px 4px 0;color:#5C4A3A">${escapeHtml(label)}</td><td style="padding:4px 0"><b>${escapeHtml(value)}</b></td></tr>`
    : ''
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'DealMatch <notifications@dealmatch.com.ng>',
        to: [to],
        subject: ('New enquiry: ' + pageTitle).slice(0, 200),
        html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
          + '<h2 style="color:#1A1210">New enquiry from "' + escapeHtml(pageTitle) + '"</h2>'
          + '<table style="font-size:15px">'
          + row('Name', lead.name) + row('Phone', lead.phone) + row('Email', lead.email)
          + row('Message', lead.message) + row('Source', lead.source)
          + '</table>'
          + '<p style="color:#8A7E78;font-size:12px;margin-top:24px">They agreed to be contacted about this enquiry. '
          + 'All enquiries are also in Admin, Campaigns.</p></div>',
      }),
    })
    if (!response.ok) {
      console.error('campaign alert: provider error', response.status)
      return { sent: false, reason: 'provider_error' }
    }
    return { sent: true }
  } catch (err) {
    console.error('campaign alert failed (non-fatal):', err.message)
    return { sent: false, reason: 'error' }
  }
}
