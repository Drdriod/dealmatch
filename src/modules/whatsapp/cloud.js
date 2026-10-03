/**
 * WhatsApp Cloud API helpers (Meta Graph API).
 *
 * Everything here is a thin wrapper so the conversation engine never builds
 * raw Graph payloads, and so tests can swap the transport.
 *
 * Limits enforced by Meta, mirrored here so a long string never causes a
 * rejected send: button title 20 chars, list row title 24, row description
 * 72, up to 3 reply buttons, up to 10 list rows, interactive body 1024.
 */
import crypto from 'node:crypto'

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'

const cut = (s, n) => String(s ?? '').slice(0, n)

/**
 * Verifies Meta's X-Hub-Signature-256 header against the RAW request body.
 * Must be the exact bytes Meta sent, never JSON.stringify(parsedBody):
 * re-serialising changes unicode escaping and breaks the comparison.
 */
export function verifySignature(rawBody, headerValue, appSecret) {
  if (!appSecret || !headerValue || !rawBody) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(headerValue))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function createCloud({ token, phoneNumberId, fetchImpl = fetch } = {}) {
  async function post(payload) {
    if (!token || !phoneNumberId) {
      console.error('whatsapp cloud: WHATSAPP_CLOUD_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing')
      return { ok: false, reason: 'not_configured' }
    }
    try {
      const resp = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        console.error('whatsapp cloud send failed', resp.status, data?.error?.message || data)
        return { ok: false, reason: data?.error?.message || 'send_failed', code: data?.error?.code }
      }
      return { ok: true, id: data?.messages?.[0]?.id }
    } catch (err) {
      console.error('whatsapp cloud network error', err?.message || err)
      return { ok: false, reason: 'network_error' }
    }
  }

  return {
    sendText: (to, body) =>
      post({ to, type: 'text', text: { body: cut(body, 1500), preview_url: false } }),

    sendButtons: (to, body, buttons) =>
      post({
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: cut(body, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map(b => ({
              type: 'reply',
              reply: { id: cut(b.id, 256), title: cut(b.title, 20) },
            })),
          },
        },
      }),

    sendList: (to, body, buttonLabel, sections) =>
      post({
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: cut(body, 1024) },
          action: {
            button: cut(buttonLabel, 20),
            sections: sections.map(s => ({
              title: cut(s.title, 24),
              rows: s.rows.slice(0, 10).map(r => ({
                id: cut(r.id, 200),
                title: cut(r.title, 24),
                ...(r.description ? { description: cut(r.description, 72) } : {}),
              })),
            })),
          },
        },
      }),

    sendCtaUrl: (to, body, label, url) =>
      post({
        to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: cut(body, 1024) },
          action: { name: 'cta_url', parameters: { display_text: cut(label, 20), url } },
        },
      }),
  }
}
