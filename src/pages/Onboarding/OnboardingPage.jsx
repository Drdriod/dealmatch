import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AcademicCapIcon, ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, BuildingOffice2Icon, CheckIcon, EllipsisHorizontalCircleIcon,
  ExclamationCircleIcon, HomeIcon, HomeModernIcon, KeyIcon, MoonIcon, PlusCircleIcon, ShieldCheckIcon, UsersIcon,
  WrenchIcon, WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { saveOnboardingProfile } from '@/data/profileRepository'
import { useAuth } from '@/context/AuthContext'
import { analytics } from '@/lib/posthog'
import { clearIntent, resolveIntent } from '@/lib/intent'
import { parseLocation } from '@/lib/location'
import LocationField from '@/components/ui/LocationField'
import toast from 'react-hot-toast'

/**
 * Onboarding
 * ══════════
 * Two short screens at most, and often just one.
 *
 *   1. "What are you here to do?"  (skipped when we already know, e.g. the
 *      visitor searched for a professional or opened List a place)
 *   2. One detail screen for that intent: what kind, and where.
 *
 * Nothing here is mandatory except what decides where to send an offering
 * person (which form to open). Buying, selling and investing are not asked
 * here: they are Places sub-categories, found inside Places.
 *
 * Identity verification is NOT part of onboarding. It is optional now and
 * only required before a booking, payment or agreement
 * (see src/hooks/useVerificationGuard.js).
 *
 * The profile columns written (role, roles, property_goal, city, state,
 * preferred_states, onboarding_completed) are the same ones the rest of
 * the app already reads, so dashboards and permissions keep working.
 */

const DRAFT_KEY = 'dm_onboarding_draft'

const INTENT_CARDS = [
  { id: 'find_place',  icon: HomeIcon,      title: 'Find a place',        desc: 'Shortlets, rentals and student housing' },
  { id: 'find_person', icon: UsersIcon,     title: 'Find a professional', desc: 'Artisans, tutors and home services' },
  { id: 'offer_place', icon: BuildingOffice2Icon, title: 'List a place',        desc: 'Rent out a home, shortlet or hostel' },
  { id: 'offer_skill', icon: WrenchScrewdriverIcon,     title: 'Offer a skill',       desc: 'Get hired for the work you do' },
]

// role/goal map each option onto the existing profile columns.
const DETAIL = {
  find_place: {
    title: 'What kind of place?',
    sub: 'Pick any that fit. You can change this later.',
    multi: true,
    required: false,
    whereLabel: 'Where?',
    wherePlaceholder: 'City or area, e.g. Lekki, Lagos',
    cta: 'Show me places',
    options: [
      { id: 'short_stay', icon: MoonIcon, label: 'Short stay',     desc: 'Shortlets and hotels',                    role: 'renter',  goal: 'short_term',     words: 'shortlet' },
      { id: 'rent',       icon: KeyIcon,           label: 'Long-term rent', desc: 'Flats and houses to rent',                role: 'renter',  goal: 'long_term',      words: 'rent' },
      { id: 'student',    icon: AcademicCapIcon, label: 'Student housing', desc: 'Hostels near school. Student verification is free', role: 'student', goal: 'student_hostel', words: 'student hostel' },
    ],
  },
  find_person: {
    title: 'What do you need help with?',
    sub: 'Pick any that fit. You can change this later.',
    multi: true,
    required: false,
    whereLabel: 'Where?',
    wherePlaceholder: 'City or area, e.g. Ikeja, Lagos',
    cta: 'Find professionals',
    options: [
      { id: 'trades',       icon: WrenchScrewdriverIcon,  label: 'Repairs and trades', desc: 'Electrician, plumber, builder',  words: 'repairs' },
      { id: 'home_service', icon: HomeModernIcon,     label: 'Home services',      desc: 'Cleaning, laundry, moving',      words: 'home service' },
      { id: 'tutor',        icon: BookOpenIcon, label: 'Tutoring and lessons', desc: 'Home lessons and exam prep',   words: 'tutor' },
      { id: 'other',        icon: EllipsisHorizontalCircleIcon, label: 'Something else',     desc: 'Tell us in the search',          words: '' },
    ],
  },
  offer_place: {
    title: 'What are you listing?',
    sub: 'This picks the right form for you.',
    multi: false,
    required: true,
    whereLabel: 'Where is it?',
    wherePlaceholder: 'City or area, e.g. Lekki, Lagos',
    cta: 'Start my listing',
    options: [
      { id: 'short_stay', icon: MoonIcon, label: 'Short stay or hotel', desc: 'Shortlet, hotel or guest house', role: 'landlord', goal: 'hotel_income' },
      { id: 'rent',       icon: KeyIcon,           label: 'Home to rent',        desc: 'Flat, house or room',            role: 'landlord', goal: 'rental_income' },
      { id: 'student',    icon: AcademicCapIcon, label: 'Student hostel',      desc: 'Rooms for students',             role: 'landlord', goal: 'rental_income' },
    ],
  },
  offer_skill: {
    title: 'What do you do?',
    sub: 'Pick the closest fit. You will add details next.',
    multi: false,
    required: false,
    whereLabel: 'Where do you work?',
    wherePlaceholder: 'City or area, e.g. Yaba, Lagos',
    cta: 'Set up my profile',
    options: [
      { id: 'artisan',      icon: WrenchIcon,   label: 'Artisan or trade', desc: 'Electrician, plumber, carpenter' },
      { id: 'home_service', icon: HomeModernIcon,     label: 'Home service',     desc: 'Cleaning, laundry, moving' },
      { id: 'tutor',        icon: BookOpenIcon, label: 'Tutor',            desc: 'Lessons and coaching' },
      { id: 'other_skill',  icon: PlusCircleIcon, label: 'Other skill',      desc: 'Anything else you are good at' },
    ],
  },
}

function readDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') } catch { return null }
}

/** Where to send the person once their choices are saved. */
function destinationFor(intent, picks, where) {
  if (intent === 'offer_place') return { to: picks[0] === 'student' ? '/list-hostel' : '/list-rental' }
  if (intent === 'offer_skill') return { to: '/verify-skill', state: picks[0] ? { categoryType: picks[0] } : undefined }

  if (intent === 'find_place' && picks.length === 1 && picks[0] === 'student') return { to: '/student-hostels' }

  const words = DETAIL[intent].options.filter(o => picks.includes(o.id)).map(o => o.words).filter(Boolean)
  const q = [...words, where.trim()].filter(Boolean).join(' ')
  if (!q) return { to: intent === 'find_place' ? '/places' : '/providers' }
  return { to: `/search?q=${encodeURIComponent(q)}` }
}

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Resolve once: explicit link > in-app state > what the visitor did earlier.
  const known = useMemo(() => resolveIntent({ search: location.search, state: location.state }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useMemo(() => readDraft(), [])

  const startIntent = draft?.intent || known?.intent || ''
  const validKinds = (i, kinds = []) => kinds.filter(k => DETAIL[i]?.options.some(o => o.id === k))

  const [intent, setIntent] = useState(startIntent)
  const [stage, setStage]   = useState(startIntent ? 'details' : 'intent')
  const [usedChooser, setUsedChooser] = useState(!startIntent)
  const [picks, setPicks]   = useState(draft?.picks || (startIntent ? validKinds(startIntent, known?.kinds) : []))
  const [where, setWhere]   = useState(draft?.where ?? known?.where ?? '')
  const [saving, setSaving] = useState(false)
  const [pickError, setPickError] = useState('')

  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ intent, picks, where })) } catch { /* ignore */ }
  }, [intent, picks, where])

  const cfg = intent ? DETAIL[intent] : null
  const valid = !cfg || !cfg.required || picks.length > 0

  const chooseIntent = (id) => {
    if (id !== intent) setPicks([])
    setIntent(id)
    setUsedChooser(true)
    setStage('details')
  }

  const togglePick = (id) => {
    setPickError('')
    if (!cfg.multi) { setPicks([id]); return }
    setPicks(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  }

  const finish = async ({ skip = false } = {}) => {
    if (!skip && !valid) { setPickError('Choose one to continue.'); return }
    if (!user?.id) { toast.error('You are signed out. Sign in again to continue.'); return }

    const chosen = skip || !cfg ? [] : cfg.options.filter(o => picks.includes(o.id))
    const loc = skip ? parseLocation('') : parseLocation(where)

    const payload = { id: user.id, onboarding_completed: true, updated_at: new Date().toISOString() }

    if (!skip && intent) {
      if (intent === 'offer_skill') {
        payload.role = 'professional'
        payload.roles = ['professional']
      } else if (intent === 'find_person') {
        payload.role = 'renter'
        payload.roles = ['renter']
      } else {
        const roles = [...new Set(chosen.map(o => o.role).filter(Boolean))]
        const fallback = intent === 'offer_place' ? 'landlord' : 'renter'
        payload.roles = roles.length ? roles : [fallback]
        payload.role = payload.roles[0]
        const goal = chosen.find(o => o.goal)?.goal
        if (goal) payload.property_goal = goal
      }
      if (loc.city)  payload.city = loc.city
      if (loc.state) { payload.state = loc.state; payload.preferred_states = [loc.state] }
    }

    const dest = skip ? { to: '/' } : destinationFor(intent, picks, where)

    setSaving(true)
    const go = async () => {
      try {
        await Promise.race([
          refreshProfile(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ])
      } catch { /* profile reloads on the next page */ }
      try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      clearIntent()
      navigate(dest.to, dest.state ? { state: dest.state } : undefined)
    }

    try {
      const { error } = await saveOnboardingProfile(user.id, payload)
      if (error) throw error
      analytics.onboardingDone?.({ role: payload.role, roles: payload.roles, goal: payload.property_goal, intent: skip ? 'skipped' : intent })
      await go()
    } catch (err) {
      console.error('Onboarding save error:', err)
      // Known RLS recursion quirk: the write went through, so keep moving.
      if (err.message?.includes('infinite recursion') || err.message?.includes('timeout')) {
        await go()
        return
      }
      toast.error('We couldn\'t save that. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const totalSteps = usedChooser ? 2 : 1
  const stepNo = stage === 'intent' ? 1 : (usedChooser ? 2 : 1)

  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-paper'
  const card = (active) => `flex w-full items-center gap-4 rounded-[28px_28px_28px_10px] border-2 p-4 text-left backdrop-blur-xl transition-all ${focusRing} ${
    active ? 'border-terracotta bg-orange-pale/80 shadow-card' : 'border-white/70 bg-white/80 shadow-card hover:-translate-y-0.5 hover:border-deep/20'}`

  return (
    <div className="relative min-h-screen bg-paper text-deep">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/10 blur-3xl" />
        <div className="absolute -right-20 bottom-10 h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/15 blur-3xl" />
      </div>

      <header className="relative mx-auto flex max-w-md items-center justify-between px-4 pt-5">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-black">
          <img src="/brand/dealmatch-icon-transparent.png" alt="" className="h-7 w-auto" />
          Deal<span className="text-[#C96A3A]">Match</span>
        </Link>
        <button type="button" onClick={() => finish({ skip: true })} disabled={saving}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold text-warm hover:text-deep disabled:opacity-60 ${focusRing}`}>
          Skip for now
        </button>
      </header>

      <main className="relative mx-auto max-w-md px-4 pb-10 pt-8">
        {totalSteps > 1 && (
          <div className="mb-7" role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={stepNo} aria-label={`Step ${stepNo} of ${totalSteps}`}>
            <p className="mb-2.5 text-xs font-semibold text-warm">Step {stepNo} of {totalSteps}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-deep/10">
              <div className="h-full rounded-full bg-terracotta transition-all duration-500" style={{ width: `${(stepNo / totalSteps) * 100}%` }} />
            </div>
          </div>
        )}

        {stage === 'intent' && (
          <section>
            <div className="mb-6">
              <h1 className="font-display text-3xl">Welcome to DealMatch.</h1>
              <p className="mt-1.5 text-sm text-warm">What are you here to do?</p>
            </div>
            <div className="space-y-3">
              {INTENT_CARDS.map((c) => {
                const Icon = c.icon
                const active = intent === c.id
                return (
                  <button key={c.id} type="button" onClick={() => chooseIntent(c.id)} aria-pressed={active} className={card(active)}>
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[18px_18px_18px_6px] bg-orange-pale text-terracotta">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[15px] font-bold">{c.title}</span>
                      <span className="mt-0.5 block text-xs text-warm">{c.desc}</span>
                    </span>
                    <ArrowRightIcon className="h-5 w-5 flex-shrink-0 text-warm" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {stage === 'details' && cfg && (
          <section>
            <div className="mb-6">
              <h1 className="font-display text-3xl">{cfg.title}</h1>
              <p className="mt-1.5 text-sm text-warm">{cfg.sub}</p>
            </div>

            <div role={cfg.multi ? 'group' : 'radiogroup'} aria-label={cfg.title} className="space-y-2.5">
              {cfg.options.map((o) => {
                const Icon = o.icon
                const active = picks.includes(o.id)
                return (
                  <button key={o.id} type="button" onClick={() => togglePick(o.id)}
                    role={cfg.multi ? undefined : 'radio'} aria-checked={cfg.multi ? undefined : active} aria-pressed={cfg.multi ? active : undefined}
                    className={card(active)}>
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[16px_16px_16px_6px] bg-orange-pale text-terracotta">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold">{o.label}</span>
                      <span className="mt-0.5 block text-xs text-warm">{o.desc}</span>
                    </span>
                    <span aria-hidden="true" className={`flex h-6 w-6 flex-shrink-0 items-center justify-center border-2 ${cfg.multi ? 'rounded-lg' : 'rounded-full'} ${active ? 'border-terracotta bg-terracotta text-white' : 'border-line bg-white'}`}>
                      {active ? <CheckIcon className="h-4 w-4" strokeWidth={3} /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
            {pickError ? (
              <p role="alert" className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-terracotta-dark">
                <ExclamationCircleIcon className="h-4 w-4" aria-hidden="true" /> {pickError}
              </p>
            ) : null}

            <label className="mt-6 block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider">{cfg.whereLabel}</span>
              <LocationField value={where} onChange={setWhere} placeholder={cfg.wherePlaceholder}
                className="input w-full !bg-white text-sm" ariaLabel={cfg.whereLabel} />
            </label>

            <div className="mt-7 flex gap-3">
              {usedChooser ? (
                <button type="button" onClick={() => setStage('intent')} disabled={saving} aria-label="Back"
                  className={`rounded-full border border-line bg-white px-5 text-warm hover:text-deep ${focusRing}`}>
                  <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
              <button type="button" onClick={() => finish()} disabled={saving}
                className="btn-primary flex flex-1 items-center justify-center gap-2 !py-4">
                {saving ? 'Saving…' : <><span>{cfg.cta}</span> <ArrowRightIcon className="h-4 w-4" aria-hidden="true" /></>}
              </button>
            </div>

            {!usedChooser && (
              <button type="button" onClick={() => { setUsedChooser(true); setStage('intent') }}
                className="mx-auto mt-4 block text-xs font-semibold text-warm underline hover:text-deep">
                Not what you are after? Change
              </button>
            )}

            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-warm">
              <ShieldCheckIcon className="mt-px h-4 w-4 flex-shrink-0 text-forest" aria-hidden="true" />
              <span>Verifying your identity is optional for now. You will only need it before a booking, payment or agreement.</span>
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
