/**
 * Abuse guard for the WhatsApp channel: input normalisation, content
 * screening, country allow-list, and money parsing.
 *
 * Design rule: block the clearly illegal, refuse (without punishing) the
 * merely off-platform, and never over-match. "weed removal" is a gardener,
 * "gun" inside "begun" is nothing, so illegal terms are whole-word phrases.
 */

export function normalizeWaId(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return /^[0-9]{8,15}$/.test(digits) ? digits : null
}

export function maskWaId(waId) {
  const s = String(waId || '')
  if (s.length < 7) return '***'
  return `+${s.slice(0, 3)}***${s.slice(-3)}`
}

/** Only numbers with an allowed country prefix may open a NEW contact. Default: Nigeria. */
export function isAllowedCountry(waId, allowedPrefixes = ['234']) {
  const list = (allowedPrefixes || []).filter(Boolean)
  if (list.length === 0) return true
  return list.some(p => String(waId).startsWith(String(p)))
}

export function cleanText(input, max = 500) {
  return String(input ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

const ILLEGAL = [
  /\b(ak[- ]?47|pistol|rifle|firearms?|ammunition|explosives?|grenades?|locally made gun)\b/i,
  /\b(cocaine|heroin|methamphetamine|mdma|ecstasy|indian hemp|sell(ing)? drugs|buy(ing)? drugs|drug dealer)\b/i,
  /\b(hitman|assassin|kidnap(ping|per)?|ransom|money ritual|ritual killing)\b/i,
  /\b(fake|forged|counterfeit) (certificates?|documents?|passports?|ids?|naira|currency|results?|licen[sc]es?)\b/i,
  /\b(yahoo ?boys?|cloned? (card|atm)|carding|hack(ing)? (an? )?(account|phone|whatsapp|instagram)|bank logs?|sim swap)\b/i,
  /\b(escort|sex (service|worker)s?|nudes?|hook ?up|prostitut\w*)\b/i,
  /\b(human trafficking|organ sale|child labou?r)\b/i,
]

const CONTACT_LEAK = [
  /\+?\d[\d\s().-]{8,}\d/,                                   // phone numbers
  /https?:\/\/|www\./i,                                      // links
  /\b[a-z0-9-]+\.(com|ng|net|org|co|io|me|app)\b/i,          // bare domains
  /\S+@\S+\.\S+/,                                            // emails
  /\b(wa\.me|whatsapp me|call me on|dm me)\b/i,              // off-platform nudges
]

/**
 * @returns {{ ok: true } | { ok: false, reason: 'illegal' | 'contact_info' }}
 * 'illegal'      -> refuse AND add a strike
 * 'contact_info' -> refuse politely, no strike (people do this innocently)
 */
export function screenText(text) {
  const t = String(text ?? '')
  if (ILLEGAL.some(r => r.test(t))) return { ok: false, reason: 'illegal' }
  if (CONTACT_LEAK.some(r => r.test(t))) return { ok: false, reason: 'contact_info' }
  return { ok: true }
}

/** "500k", "1.5m", "2,000,000", "N750,000", "skip" -> { skip } | { value } | { invalid } */
export function parseNaira(text) {
  const t = String(text ?? '').toLowerCase().replace(/[,\s]/g, '').replace(/^(ngn|n|₦)/, '')
  if (!t || ['skip', 'any', 'none', 'nolimit'].includes(t)) return { skip: true }
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m|million|thousand)?$/)
  if (!m) return { invalid: true }
  let n = parseFloat(m[1])
  if (m[2] === 'k' || m[2] === 'thousand') n *= 1_000
  if (m[2] === 'm' || m[2] === 'million') n *= 1_000_000
  n = Math.round(n)
  if (n < 1000 || n > 50_000_000_000) return { invalid: true }
  return { value: n }
}

/** Location words worth matching on (drops filler like "state", "road"). */
const STOP = new Set(['state', 'lga', 'road', 'street', 'close', 'estate', 'area', 'town', 'city', 'the', 'and', 'near', 'around', 'along'])
export function locationTokens(text) {
  return cleanText(text, 80)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !STOP.has(w))
    .slice(0, 4)
}

export function formatNaira(n) {
  if (n == null || Number.isNaN(Number(n))) return ''
  return 'NGN ' + Math.round(Number(n)).toLocaleString('en-NG')
}
