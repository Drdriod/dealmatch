import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Award, BookOpen, Building2, Check, ConciergeBell, GraduationCap,
  HardHat, Home, Key, ShieldCheck, Sparkles, Users, Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
  { id: 'find_place',  icon: Home,      title: 'Find a place',        desc: 'Shortlets, rentals and student housing' },
  { id: 'find_person', icon: Users,     title: 'Find a professional', desc: 'Artisans, tutors and home services' },
  { id: 'offer_place', icon: Building2, title: 'List a place',        desc: 'Rent out a home, shortlet or hostel' },
  { id: 'offer_skill', icon: Award,     title: 'Offer a skill',       desc: 'Get hired for the work you do' },
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
      { id: 'short_stay', icon: ConciergeBell, label: 'Short stay',     desc: 'Shortlets and hotels',                    role: 'renter',  goal: 'short_term',     words: 'shortlet' },
      { id: 'rent',       icon: Key,           label: 'Long-term rent', desc: 'Flats and houses to rent',                role: 'renter',  goal: 'long_term',      words: 'rent' },
      { id: 'student',    icon: GraduationCap, label: 'Student housing', desc: 'Hostels near school. Student verification is free', role: 'student', goal: 'student_hostel', words: 'student hostel' },
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
      { id: 'trades',       icon: HardHat,  label: 'Repairs and trades', desc: 'Electrician, plumber, builder',  words: 'repairs' },
      { id: 'home_service', icon: Home,     label: 'Home services',      desc: 'Cleaning, laundry, moving',      words: 'home service' },
      { id: 'tutor',        icon: BookOpen, label: 'Tutoring and lessons', desc: 'Home lessons and exam prep',   words: 'tutor' },
      { id: 'other',        icon: Sparkles, label: 'Something else',     desc: 'Tell us in the search',          words: '' },
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
      { id: 'short_stay', icon: ConciergeBell, label: 'Short stay or hotel', desc: 'Shortlet, hotel or guest house', role: 'landlord', goal: 'hotel_income' },
      { id: 'rent',       icon: Key,           label: 'Home to rent',        desc: 'Flat, house or room',            role: 'landlord', goal: 'rental_income' },
      { id: 'student',    icon: GraduationCap, label: 'Student hostel',      desc: 'Rooms for students',             role: 'landlord', goal: 'rental_income' },
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
      { id: 'artisan',      icon: Wrench,   label: 'Artisan or trade', desc: 'Electrician, plumber, carpenter' },
      { id: 'home_service', icon: Home,     label: 'Home service',     desc: 'Cleaning, laundry, moving' },
      { id: 'tutor',        icon: BookOpen, label: 'Tutor',            desc: 'Lessons and coaching' },
      { id: 'other_skill',  icon: Sparkles, label: 'Other skill',      desc: 'Anything else you are good at' },
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
    if (!cfg.multi) { setPicks([id]); return }
    setPicks(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  }

  const finish = async ({ skip = false } = {}) => {
    if (!skip && !valid) { toast.error('Pick one to continue'); return }
    if (!user?.id) { toast.error('Not signed in. Please sign in again.'); return }

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
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id)
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
      toast.error('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const totalSteps = usedChooser ? 2 : 1
  const stepNo = stage === 'intent' ? 1 : (usedChooser ? 2 : 1)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFAF5' }}>
      <header className="max-w-md mx-auto flex items-center justify-between px-4 pt-5">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-black" style={{ color: '#17211B' }}>
          <img src="/brand/dealmatch-icon-transparent.png" alt="" className="h-7 w-auto" />
          Deal<span style={{ color: '#C96A3A' }}>Match</span>
        </Link>
        <button type="button" onClick={() => finish({ skip: true })} disabled={saving}
          className="text-sm font-semibold px-2 py-1" style={{ color: '#647068' }}>
          Skip for now
        </button>
      </header>

      <main className="max-w-md mx-auto px-4 pt-8 pb-10">
        {totalSteps > 1 && (
          <div className="mb-7">
            <div className="flex items-center justify-between text-xs mb-2.5" style={{ color: '#647068' }}>
              <span>Step {stepNo} of {totalSteps}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(23,33,27,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(stepNo / totalSteps) * 100}%`, backgroundColor: '#C85F2D' }} />
            </div>
          </div>
        )}

        {stage === 'intent' && (
          <section>
            <div className="mb-6">
              <h1 className="font-display text-3xl" style={{ color: '#17211B' }}>Welcome to DealMatch!</h1>
              <p className="text-sm mt-1.5" style={{ color: '#647068' }}>What are you here to do?</p>
            </div>
            <div className="space-y-3">
              {INTENT_CARDS.map(c => {
                const Icon = c.icon
                const active = intent === c.id
                return (
                  <button key={c.id} type="button" onClick={() => chooseIntent(c.id)} aria-pressed={active}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all"
                    style={{ borderColor: active ? '#C85F2D' : '#DEDDD6', backgroundColor: active ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}>
                    <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
                      <Icon size={20} style={{ color: '#C85F2D' }} />
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold text-sm" style={{ color: '#17211B' }}>{c.title}</span>
                      <span className="block text-xs mt-0.5" style={{ color: '#647068' }}>{c.desc}</span>
                    </span>
                    <ArrowRight size={16} style={{ color: '#647068' }} />
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {stage === 'details' && cfg && (
          <section>
            <div className="mb-6">
              <h1 className="font-display text-3xl" style={{ color: '#17211B' }}>{cfg.title}</h1>
              <p className="text-sm mt-1.5" style={{ color: '#647068' }}>{cfg.sub}</p>
            </div>

            <div className="space-y-2.5">
              {cfg.options.map(o => {
                const Icon = o.icon
                const active = picks.includes(o.id)
                return (
                  <button key={o.id} type="button" onClick={() => togglePick(o.id)} aria-pressed={active}
                    className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl border-2 text-left transition-all"
                    style={{ borderColor: active ? '#C85F2D' : '#DEDDD6', backgroundColor: active ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
                      <Icon size={18} style={{ color: '#C85F2D' }} />
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold text-sm" style={{ color: '#17211B' }}>{o.label}</span>
                      <span className="block text-xs mt-0.5" style={{ color: '#647068' }}>{o.desc}</span>
                    </span>
                    {active && <Check size={16} style={{ color: '#C85F2D' }} />}
                  </button>
                )
              })}
            </div>

            <label className="block mt-6">
              <span className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#17211B' }}>{cfg.whereLabel}</span>
              <LocationField value={where} onChange={setWhere} placeholder={cfg.wherePlaceholder}
                className="input w-full text-sm" ariaLabel={cfg.whereLabel} />
            </label>

            <div className="flex gap-3 mt-7">
              {usedChooser ? (
                <button type="button" onClick={() => setStage('intent')} disabled={saving} aria-label="Back"
                  className="px-5 py-4 rounded-2xl border" style={{ borderColor: '#DEDDD6', color: '#647068', backgroundColor: '#FFFFFF' }}>
                  <ArrowLeft size={16} />
                </button>
              ) : null}
              <button type="button" onClick={() => finish()} disabled={saving || !valid}
                className="btn-primary flex-1 py-4 flex items-center justify-center gap-2"
                style={{ opacity: valid ? 1 : 0.5 }}>
                {saving ? 'Saving...' : <><span>{cfg.cta}</span> <ArrowRight size={15} /></>}
              </button>
            </div>

            {!usedChooser && (
              <button type="button" onClick={() => { setUsedChooser(true); setStage('intent') }}
                className="block mx-auto mt-4 text-xs font-semibold underline" style={{ color: '#647068' }}>
                Not what you are after? Change
              </button>
            )}

            <p className="flex items-start gap-2 mt-6 text-xs leading-relaxed" style={{ color: '#647068' }}>
              <ShieldCheck size={15} className="flex-shrink-0 mt-px" style={{ color: '#234C3A' }} />
              <span>Verifying your identity is optional for now. You will only need it before a booking, payment or agreement.</span>
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
