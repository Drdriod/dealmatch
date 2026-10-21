import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, MapPin, Search, Users } from 'lucide-react'
import LocationField from '@/components/ui/LocationField'
import { rememberIntent } from '@/lib/intent'

// Only things DealMatch actually supports today: Places (shortlet / house
// rent) and People (skilled services). Never list a category that does not
// exist yet.
const MODES = {
  place: {
    label: 'A place',
    cta: 'Find a place',
    icon: MapPin,
    placeholder: 'Shortlet, flat or house to rent',
  },
  person: {
    label: 'A professional',
    cta: 'Find a professional',
    icon: Users,
    placeholder: 'Electrician, plumber, cleaner or tutor',
  },
}

/**
 * Segmented hero search: what kind of thing (place / professional), what
 * the need is, and where. Category and location are explicit instead of
 * hidden in one free-text box. Always routes to the universal search page,
 * which runs the real federated query and AI/location matching, so the
 * results (not a client-side guess) decide what is shown.
 */
export default function HeroSearch({ className = '' }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('place')
  const [what, setWhat] = useState('')
  const [where, setWhere] = useState('')

  const submit = (e) => {
    e.preventDefault()
    // If this visitor signs up next, onboarding already knows what they want.
    rememberIntent(mode === 'place' ? 'find_place' : 'find_person', { where: where.trim() })
    const text = [what.trim(), where.trim()].filter(Boolean).join(' ')
    navigate(text ? `/search?q=${encodeURIComponent(text)}` : '/search')
  }

  return (
    <form onSubmit={submit} className={`w-full max-w-[700px] ${className}`}>
      <div className="rounded-[20px] p-2 shadow-soft bg-white" style={{ border: '1px solid rgba(23,33,27,0.08)' }}>
        <div className="flex gap-1 px-1 pb-2" role="tablist" aria-label="What are you looking for?">
          {Object.entries(MODES).map(([key, m]) => {
            const active = mode === key
            return (
              <button key={key} type="button" role="tab" aria-selected={active} onClick={() => setMode(key)}
                className={`inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-xs font-bold transition-colors ${active ? 'bg-forest-pale text-forest' : 'text-deep/60 hover:text-deep'}`}>
                <m.icon size={15} /> {m.label}
              </button>
            )
          })}
        </div>

        <div className="grid sm:grid-cols-[1.4fr_0.8fr_auto] items-stretch">
          <label className="px-4 py-2 sm:border-r border-line border-b sm:border-b-0">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider mb-1">What do you need?</span>
            <span className="flex items-center gap-2 text-deep/60">
              <Search size={16} className="flex-shrink-0" />
              <input value={what} onChange={e => setWhat(e.target.value)} placeholder={MODES[mode].placeholder}
                className="w-full min-w-0 bg-transparent outline-none text-sm text-deep placeholder:text-deep/40" />
            </span>
          </label>
          <label className="px-4 py-2 border-b sm:border-b-0 border-line">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider mb-1">Where?</span>
            <span className="flex items-center gap-2 text-deep/60">
              <MapPin size={16} className="flex-shrink-0" />
              <LocationField value={where} onChange={setWhere} placeholder="City or area" ariaLabel="Where?"
                className="w-full min-w-0 bg-transparent outline-none text-sm text-deep placeholder:text-deep/40" />
            </span>
          </label>
          <button type="submit"
            className="mt-2 sm:mt-0 sm:ml-2 self-center min-h-[52px] px-6 rounded-full text-sm font-bold inline-flex items-center justify-center gap-1.5 bg-terracotta text-white transition hover:bg-[#A8441D] hover:shadow-[0_10px_25px_rgba(200,95,45,0.23)]">
            {MODES[mode].cta} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </form>
  )
}
