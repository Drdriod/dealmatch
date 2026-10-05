import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, ListChecks, Handshake, UserCheck, Inbox, BadgeCheck } from 'lucide-react'

// Two journeys, not one generic flow: people searching, and people offering.
// Copy stays generic about transaction type on purpose (book, connect or
// escrow depends on the deal), so nothing implies universal protection.
const JOURNEYS = [
  {
    key: 'search',
    kicker: 'If you are looking',
    title: 'Find the right place or person',
    cta: { to: '/search', label: 'Start searching' },
    steps: [
      { icon: Search,     title: 'Describe what you need', body: 'Pick a place or a professional, add what you need and where.' },
      { icon: ListChecks, title: 'Compare verified options', body: 'Each profile shows exactly which checks it has passed.' },
      { icon: Handshake,  title: 'Connect securely',        body: 'Book or connect through the protected steps available for that deal.' },
    ],
  },
  {
    key: 'offer',
    kicker: 'If you are offering',
    title: 'Get found by people who need you',
    cta: { to: '/verify-skill', label: 'Offer a skill' },
    steps: [
      { icon: UserCheck,  title: 'Create and verify your profile', body: 'List your place or skill and complete the verification steps.' },
      { icon: Inbox,      title: 'Receive relevant requests',      body: 'Get matched with people who are looking for what you offer.' },
      { icon: BadgeCheck, title: 'Agree and complete the deal',    body: 'Confirm the details, complete the work and build your reputation.' },
    ],
  },
]

/** "How DealMatch works", split into the searcher and provider journeys. */
export default function HowItWorksFlip() {
  return (
    <section className="py-20 px-5 sm:px-7" style={{ backgroundColor: '#173428' }}>
      <div className="max-w-[1184px] mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] mb-3" style={{ color: '#F3C96A' }}>How DealMatch works</p>
          <h2 className="font-display text-4xl sm:text-5xl text-white">Two sides, one clear path.</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {JOURNEYS.map(j => (
            <div key={j.key} className="rounded-[22px] p-7 sm:p-9" style={{ backgroundColor: '#234C3A' }}>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] mb-2" style={{ color: '#F3C96A' }}>{j.kicker}</p>
              <h3 className="font-display text-2xl sm:text-3xl text-white mb-7">{j.title}</h3>
              <ol className="space-y-5 mb-8">
                {j.steps.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#C85F2D' }}>
                      <s.icon size={19} color="#FFFFFF" />
                    </span>
                    <div>
                      <p className="font-bold text-white text-sm"><span style={{ color: '#F3C96A' }}>{i + 1}.</span> {s.title}</p>
                      <p className="text-sm leading-relaxed mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to={j.cta.to} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-deep hover:bg-cream transition-colors">
                {j.cta.label} <ArrowRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
