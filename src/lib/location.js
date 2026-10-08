/**
 * Location lookup
 * ═══════════════
 * One place that decides how a "Where?" answer is captured, so the rest of
 * the app never cares whether it came from free text or an official
 * address / postcode service.
 *
 * TODAY: free text. Every field accepts whatever the person types, and
 * `parseLocation` pulls out a Nigerian state when one is mentioned so
 * matching can use it.
 *
 * SOON: the national postcode service (postcode.gov.ng). To switch it on:
 *   1. implement `postcodeProvider.search` below (call the API, map each
 *      result to a LocationOption);
 *   2. set VITE_LOCATION_PROVIDER=postcode in the environment;
 *   3. nothing else changes. LocationField will start showing suggestions
 *      and the selected option carries a real postcode into onboarding,
 *      search and listings.
 *
 * @typedef {Object} LocationOption
 * @property {string} id         stable id from the provider
 * @property {string} label      what the person sees and what gets stored as text
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [postcode]
 */

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau',
  'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
]

// Words that mean a state but are not spelled like its list entry.
const STATE_ALIASES = {
  'FCT (Abuja)': ['fct', 'abuja', 'federal capital territory'],
}

const PROVIDER = (import.meta.env?.VITE_LOCATION_PROVIDER || 'free_text').toLowerCase()

/** True once a real lookup service is configured. */
export const hasLocationLookup = () => PROVIDER !== 'free_text'

/**
 * Turn whatever was typed (or picked) into structured fields.
 * "Lekki, Lagos" -> { city: 'Lekki', state: 'Lagos' }; "Lagos" -> { state: 'Lagos' }.
 */
export function parseLocation(text = '') {
  const label = String(text).trim()
  if (!label) return { label: '', city: '', state: '', postcode: '', source: 'free_text' }

  const lower = label.toLowerCase()
  let state = ''
  let matched = ''
  for (const s of NIGERIAN_STATES) {
    const names = [s.toLowerCase(), ...(STATE_ALIASES[s] || [])]
    const hit = names.find(n => new RegExp(`(^|[^a-z])${n.replace(/[()]/g, '\\$&')}($|[^a-z])`).test(lower))
    if (hit) { state = s; matched = hit; break }
  }

  let city = label
  if (state) {
    city = label
      .replace(new RegExp(matched.replace(/[()]/g, '\\$&'), 'i'), '')
      .replace(/\bstate\b/i, '')
      .replace(/[,\s]+$/g, '')
      .replace(/^[,\s]+/g, '')
      .trim()
  }
  return { label, city, state, postcode: '', source: 'free_text' }
}

// ── postcode.gov.ng (not wired yet) ────────────────────────────────────────
const postcodeProvider = {
  /**
   * @param {string} query
   * @param {{signal?: AbortSignal}} [opts]
   * @returns {Promise<LocationOption[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async search(query, opts) {
    // TODO(postcode.gov.ng): call the API here and map results to
    // LocationOption. Until then there is nothing to suggest.
    return []
  },
}

/** Suggestions for a partly typed location. Always resolves; never throws. */
export async function searchLocations(query, opts = {}) {
  const q = String(query || '').trim()
  if (q.length < 2 || !hasLocationLookup()) return []
  try {
    if (PROVIDER === 'postcode') return await postcodeProvider.search(q, opts)
  } catch (err) {
    if (err?.name !== 'AbortError') console.warn('[location] lookup failed, falling back to free text', err)
  }
  return []
}
