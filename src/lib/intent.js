/**
 * Visitor intent
 * ══════════════
 * What a visitor has shown they want to do (find a place, find a
 * professional, list a place, offer a skill). It is remembered in the
 * browser so that when they sign up, onboarding already knows and does
 * not ask the same question again.
 *
 * Sources, strongest first:
 *   1. ?intent=... in the onboarding URL (explicit links)
 *   2. location.state.intent (in-app navigation)
 *   3. what the visitor did earlier (hero search, pages they opened)
 *
 * Everything here is best-effort: storage can be blocked (private mode),
 * so every read and write is wrapped and failure just means "unknown".
 */

const KEY = 'dm_intent_v1'
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 // stale intent is worse than none

export const INTENTS = ['find_place', 'find_person', 'offer_place', 'offer_skill']

export const isIntent = (v) => INTENTS.includes(v)

/**
 * Pages that express an intent just by being opened. `kinds` pre-selects
 * the matching option in onboarding (ids defined in OnboardingPage).
 */
const PATH_RULES = [
  { test: p => p === '/student-hostels',                    intent: 'find_place',  kinds: ['student'] },
  { test: p => p === '/hotels',                             intent: 'find_place',  kinds: ['short_stay'] },
  { test: p => p === '/places' || p === '/rentals' || p.startsWith('/property/'), intent: 'find_place' },
  { test: p => p === '/providers' || p.startsWith('/provider/') || p === '/request', intent: 'find_person' },
  { test: p => p === '/list-hostel',                        intent: 'offer_place', kinds: ['student'] },
  { test: p => p === '/list-rental' || p === '/list',       intent: 'offer_place' },
  { test: p => p === '/verify-skill' || p === '/apply-professional', intent: 'offer_skill' },
]

export function intentForPath(pathname = '') {
  const hit = PATH_RULES.find(r => r.test(pathname))
  return hit ? { intent: hit.intent, kinds: hit.kinds || [] } : null
}

export function readIntent() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const rec = JSON.parse(raw)
    if (!isIntent(rec?.intent)) return null
    if (!rec.at || Date.now() - rec.at > MAX_AGE_MS) { localStorage.removeItem(KEY); return null }
    return { intent: rec.intent, kinds: Array.isArray(rec.kinds) ? rec.kinds : [], where: rec.where || '' }
  } catch {
    return null
  }
}

/** Remember an intent. `where` (free text) is kept from earlier if not given. */
export function rememberIntent(intent, { kinds = [], where } = {}) {
  if (!isIntent(intent)) return
  try {
    const prev = readIntent()
    localStorage.setItem(KEY, JSON.stringify({
      intent,
      kinds,
      where: where !== undefined ? where : (prev?.where || ''),
      at: Date.now(),
    }))
  } catch { /* storage unavailable: onboarding will simply ask */ }
}

export function clearIntent() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Explicit intent wins over what we remembered. */
export function resolveIntent({ search = '', state = null } = {}) {
  const fromUrl = new URLSearchParams(search).get('intent')
  if (isIntent(fromUrl)) return { intent: fromUrl, kinds: [], where: readIntent()?.where || '' }
  if (isIntent(state?.intent)) return { intent: state.intent, kinds: state.kinds || [], where: state.where || '' }
  return readIntent()
}
