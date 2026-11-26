// Campaign pages: small pure helpers shared by the browser, the server route and the tests.
// No DOM, no network. See supabase/migrations/20261126100000_campaign_pages.sql.

export const CAMPAIGN_TEMPLATES = [
  { value: 'property_sale', label: 'Property for sale' },
  { value: 'platform_signup', label: 'Platform sign-up' },
]

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SOURCE_RE = /^[a-z0-9_.-]{1,60}$/

export function isValidSlug(slug) {
  const s = String(slug || '')
  return s.length >= 3 && s.length <= 60 && SLUG_RE.test(s)
}

// Turn "Obot Idim Road Land!" into "obot-idim-road-land".
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

// The ?src= tag on a campaign link. Anything odd becomes "other", nothing becomes "direct".
export function cleanSource(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'direct'
  return SOURCE_RE.test(s) ? s : 'other'
}

// Only the standard ad tags are kept, each trimmed, so a link cannot stuff arbitrary data into a lead.
export function pickUtm(search) {
  const out = {}
  const params = new URLSearchParams(search || '')
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = params.get(key)
    if (v) out[key] = v.slice(0, 100)
  }
  return out
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

export function campaignPhotoUrl(supabaseUrl, path) {
  if (!path) return ''
  const base = String(supabaseUrl || '').replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/campaign-images/${String(path).split('/').map(encodeURIComponent).join('/')}`
}

// A conservative check on an address typed into the admin form.
export function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '')) && String(email).length <= 200
}

// Digits and a leading plus only, 7 to 15 digits, as the database expects.
export function cleanPhone(raw) {
  const s = String(raw ?? '').replace(/[^0-9+]/g, '')
  return /^\+?[0-9]{7,15}$/.test(s) ? s : ''
}

// Checks one enquiry the same way the database will, so the form can say what is wrong first.
export function validateLead({ name, phone, email, consent }) {
  if (!String(name || '').trim() || String(name).trim().length < 2) return 'Please enter your name'
  const p = cleanPhone(phone)
  const e = String(email || '').trim()
  if (!p && !e) return 'Please give a phone number or an email'
  if (String(phone || '').trim() && !p) return 'That phone number does not look right'
  if (e && !isValidEmail(e)) return 'That email does not look right'
  if (consent !== true) return 'Please tick the box so we may contact you'
  return null
}

// Plain HTML for link previews and crawlers (WhatsApp, Facebook, Google). People get the app page.
export function renderCampaignHtml(c, { origin, supabaseUrl }) {
  const url = `${origin}/l/${c.slug}`
  const photo = c.photos && c.photos[0] ? campaignPhotoUrl(supabaseUrl, c.photos[0]) : ''
  const desc = c.subheadline || (c.description || '').slice(0, 200) || c.headline
  const facts = (Array.isArray(c.facts) ? c.facts : [])
    .map((f) => `<li>${escapeHtml(f.label)}: ${escapeHtml(f.value)}</li>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(c.title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DealMatch">
<meta property="og:title" content="${escapeHtml(c.title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(url)}">
${photo ? `<meta property="og:image" content="${escapeHtml(photo)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
</head><body><main><h1>${escapeHtml(c.headline)}</h1>
${c.subheadline ? `<p>${escapeHtml(c.subheadline)}</p>` : ''}
${facts ? `<ul>${facts}</ul>` : ''}
${c.disclosure ? `<p>${escapeHtml(c.disclosure)}</p>` : ''}
<p><a href="${escapeHtml(url)}">${escapeHtml(c.cta_label || 'Open')}</a></p></main></body></html>`
}
