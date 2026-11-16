import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AcademicCapIcon, ArrowRightIcon, BanknotesIcon, BriefcaseIcon, BuildingLibraryIcon, BuildingOffice2Icon,
  CheckCircleIcon, ClipboardDocumentListIcon, HeartIcon, HomeModernIcon, TrophyIcon, WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/context/AuthContext'
import { markOfferingServices } from '@/data/dashboardRepository'
import { useUserDashboard } from '@/hooks/useUserDashboard'
import LoadNotice from '@/components/ui/LoadNotice'
import { Sparkline } from '@/components/charts/ChartKit'
import toast from 'react-hot-toast'

const ACTIVE_STATUSES = ['active', 'ACTIVE', 'completed', 'COMPLETED']

const glass = 'border border-white/70 bg-white/80 shadow-card backdrop-blur-xl'
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'

// Progress ring on a light surface. Colours are token variables so they follow the brand.
function Ring({ value, max, label, sub, stroke }) {
  const size = 104, t = 10, r = size / 2 - t / 2, c = 2 * Math.PI * r
  const pct = Math.min(Math.max(value / (max || 1), 0), 1)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}
      role="img" aria-label={`${label}, ${sub}`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--dm-sand)" strokeWidth={t} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth={t} strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`} style={{ transition: 'stroke-dasharray 700ms ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-lg font-bold leading-none text-deep">{label}</p>
        <p className="mt-1 text-[10px] text-warm">{sub}</p>
      </div>
    </div>
  )
}

function Stat({ to, icon: Icon, iconClass, sparkColor, label, value, spark }) {
  return (
    <Link to={to} className={`block rounded-[24px_24px_24px_8px] p-4 transition-transform hover:-translate-y-0.5 ${glass} ${focusRing}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold text-warm">{label}</p>
        <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
      </div>
      <p className="font-display text-2xl text-deep">{value}</p>
      {spark ? <div className="mt-2"><Sparkline values={spark} color={sparkColor} height={32} /></div> : null}
    </Link>
  )
}

export default function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [becomingProvider, setBecomingProvider] = useState(false)
  // Loading, error and the figures all come from the hook; this page only lays them out.
  const {
    myListingsCount, myRequestsCount, myMatches, completedDeals, activity,
    listingTrend, enquiryTrend, loading, error, issues, reload,
  } = useUserDashboard(user)

  const verificationLevel = profile?.is_live_verified ? 'live' : profile?.avatar_url ? 'photo' : 'none'
  const isProvider = !!profile?.offers_services

  // "Become a Provider" is a real, honest toggle (see migration comment):
  // clicking it records intent immediately, then sends the person straight
  // into actual verification -- saying yes never grants provider status by
  // itself, it just starts the real process.
  const handleBecomeProvider = async () => {
    if (!user) return
    setBecomingProvider(true)
    const { error: saveError } = await markOfferingServices(user.id)
    setBecomingProvider(false)
    if (saveError) { toast.error('We couldn\'t save that. Please try again.'); return }
    await refreshProfile()
    toast.success("You're on your way to becoming a provider.")
    navigate('/verify-skill')
  }

  const QUICK_LINKS = [
    { to: '/matches',         icon: HeartIcon,                  label: 'My Matches' },
    { to: '/request',         icon: ClipboardDocumentListIcon,  label: 'Post a Request' },
    { to: '/manage-listings', icon: HomeModernIcon,             label: 'My Offers' },
    { to: '/wallet',          icon: BanknotesIcon,              label: 'Wallet' },
    isProvider
      ? { to: '/verify-skill', icon: TrophyIcon, label: 'My Provider Status' }
      : { to: null, icon: BriefcaseIcon, label: 'Become a Provider', onClick: handleBecomeProvider },
    { to: '/rentals',         icon: BuildingOffice2Icon,        label: 'Explore Places' },
  ]

  // Derived from fields this page already reads: name, photo, and whether
  // the person has posted anything yet. No separate completeness field exists.
  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const profileDone = [!!profile?.full_name, !!profile?.avatar_url, myListingsCount + myRequestsCount > 0].filter(Boolean).length
  const verifyScore = verificationLevel === 'live' ? 2 : verificationLevel === 'photo' ? 1 : 0
  const VERIFY_SUB = { none: 'Not started', photo: 'Photo added', live: 'Live verified' }

  const steps = [
    { key: 'photo', done: !!profile?.avatar_url, title: 'Add a profile photo', sub: 'People trust a face they can see', to: '/verify-identity' },
    { key: 'live', done: verificationLevel === 'live', title: 'Finish live verification', sub: 'Needed before any booking, payment or agreement', to: '/verify-identity' },
    { key: 'post', done: myListingsCount + myRequestsCount > 0, title: 'Find a match or create an offer', sub: 'Get your first match moving', to: '/request' },
    isProvider
      ? { key: 'provider', done: true, title: 'Provider status', sub: 'Review your provider profile', to: '/verify-skill' }
      : { key: 'provider', done: false, title: 'Become a Provider', sub: 'Starts real verification. It does not grant access by itself', onClick: handleBecomeProvider },
  ]
  const nextIdx = steps.findIndex(s => !s.done)

  const doneCount = steps.filter(x => x.done).length

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream pb-28 pt-20 text-deep">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/10 blur-3xl" />
        <div className="absolute -right-20 top-[34rem] h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4">
        <LoadNotice error={error} issues={issues} onRetry={reload} what="your dashboard" className="mb-4" />

        {/* Greeting and two progress rings */}
        <section className={`mb-4 rounded-[36px_36px_36px_12px] p-6 ${glass}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-terracotta-dark">Your journey</p>
          <h1 className="mt-1 font-display text-3xl">Welcome back, {firstName}.</h1>
          <p className="mt-1 text-sm text-warm">Everything you&apos;re looking for, interested in or currently transacting is right here.</p>
          <div className="mt-5 flex items-start justify-around">
            <div className="flex flex-col items-center gap-2">
              <Ring value={profileDone} max={3} stroke="var(--dm-forest)"
                label={`${Math.round((profileDone / 3) * 100)}%`} sub={`${profileDone} of 3`} />
              <p className="text-xs font-bold">Profile</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Ring value={verifyScore} max={2} stroke="var(--dm-terracotta)"
                label={`${Math.round((verifyScore / 2) * 100)}%`} sub={VERIFY_SUB[verificationLevel]} />
              <p className="text-xs font-bold">Verification</p>
            </div>
          </div>
        </section>

        {/* Primary entry points */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Link to="/rentals" className={`flex min-h-[140px] flex-col justify-between rounded-[28px_28px_28px_10px] bg-forest p-5 text-white shadow-card transition-transform hover:-translate-y-0.5 ${focusRing}`}>
            <HomeModernIcon className="h-7 w-7" aria-hidden="true" />
            <span>
              <span className="block font-display text-lg leading-tight">Explore Places</span>
              <span className="mt-1 block text-xs text-white/80">Shortlets, rentals &amp; housing</span>
            </span>
          </Link>
          <Link to="/find-provider" className={`flex min-h-[140px] flex-col justify-between rounded-[28px_28px_28px_10px] bg-terracotta-dark p-5 text-white shadow-card transition-transform hover:-translate-y-0.5 ${focusRing}`}>
            <WrenchScrewdriverIcon className="h-7 w-7" aria-hidden="true" />
            <span>
              <span className="block font-display text-lg leading-tight">Explore People</span>
              <span className="mt-1 block text-xs text-white/85">Skilled people &amp; services</span>
            </span>
          </Link>
        </div>

        {/* Next steps */}
        <section className={`mb-4 rounded-[32px_32px_32px_10px] p-5 ${glass}`} aria-label="Next steps">
          <p className="text-xs font-bold uppercase tracking-wider text-warm">Next steps</p>
          <h2 className="mb-4 mt-0.5 font-display text-xl">
            {nextIdx === -1 ? "You're all set" : `${doneCount} of ${steps.length} done`}
          </h2>
          <div className="space-y-2">
            {steps.map((s, i) => {
              const isNext = i === nextIdx
              const inner = (
                <>
                  {s.done
                    ? <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-forest" aria-hidden="true" />
                    : <span className={`h-6 w-6 flex-shrink-0 rounded-full border-2 ${isNext ? 'border-terracotta' : 'border-line'}`} aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${s.done ? 'text-warm line-through' : ''}`}>
                      {s.onClick && becomingProvider ? 'Saving…' : s.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-warm">{s.sub}</span>
                  </span>
                  <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-warm" aria-hidden="true" />
                </>
              )
              const rowClass = `flex w-full items-center gap-3 rounded-[20px_20px_20px_8px] border p-3 text-left transition-colors disabled:opacity-60 ${isNext ? 'border-terracotta/50 bg-orange-pale' : 'border-line bg-white/60'} ${focusRing}`
              return s.onClick ? (
                <button key={s.key} type="button" onClick={s.onClick} disabled={becomingProvider} className={rowClass}>{inner}</button>
              ) : (
                <Link key={s.key} to={s.to} className={rowClass}>{inner}</Link>
              )
            })}
          </div>
        </section>

        {/* Figures. Saved items have no data source in this page, so no tile. */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Stat to="/manage-listings" icon={HomeModernIcon} iconClass="text-forest" sparkColor="var(--dm-forest)" label="Listings" value={loading ? '–' : myListingsCount} spark={listingTrend} />
          <Stat to="/request" icon={ClipboardDocumentListIcon} iconClass="text-gold" sparkColor="var(--dm-gold)" label="Enquiries" value={loading ? '–' : myRequestsCount} spark={enquiryTrend} />
          <Stat to="/matches" icon={HeartIcon} iconClass="text-terracotta" sparkColor="var(--dm-terracotta)" label="Matches" value={loading ? '–' : myMatches} />
          <Stat to="/wallet" icon={BanknotesIcon} iconClass="text-sky" sparkColor="var(--dm-sky)" label="Completed" value={loading ? '–' : completedDeals} />
        </div>

        {/* Recent activity */}
        <section className={`mb-4 rounded-[32px_32px_32px_10px] p-5 ${glass}`} aria-label="Recent activity">
          <p className="text-xs font-bold uppercase tracking-wider text-warm">Timeline</p>
          <h2 className="mb-4 mt-0.5 font-display text-xl">Recent activity</h2>

          {loading ? (
            <div className="flex justify-center py-8" role="status" aria-label="Loading">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            </div>
          ) : activity.length === 0 ? (
            <div className="py-4 text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[20px_20px_20px_6px] bg-orange-pale text-terracotta">
                <ClipboardDocumentListIcon className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="mb-1 text-sm font-bold">You don&apos;t have any activity yet.</p>
              <p className="mb-4 text-xs text-warm">Tell us what you need or create an offer to get started.</p>
              <div className="flex justify-center gap-2">
                <Link to="/request" className="btn-primary px-5 py-2.5 text-sm">Find a Match</Link>
                <Link to="/list" className={`rounded-full border border-line bg-white px-5 py-2.5 text-sm font-bold ${focusRing}`}>Create an Offer</Link>
              </div>
            </div>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5 pb-2" style={{ scrollSnapType: 'x mandatory' }}>
              <div className="relative flex min-w-max gap-3">
                <div className="absolute left-0 right-0 top-[5px] h-px bg-gold/40" aria-hidden="true" />
                {activity.map(item => {
                  const done = ACTIVE_STATUSES.includes(item.status)
                  const Wrapper = item.link ? Link : 'div'
                  const date = new Date(item.at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
                  return (
                    <div key={item.kind + item.id} className="relative w-56 shrink-0 pt-6" style={{ scrollSnapAlign: 'start' }}>
                      <span className={`absolute left-0 top-0 h-2.5 w-2.5 rounded-full ${done ? 'bg-forest' : 'bg-gold'}`} aria-hidden="true" />
                      <Wrapper {...(item.link ? { to: item.link } : {})}
                        className={`block h-full rounded-[20px_20px_20px_8px] border border-line bg-white/70 p-3.5 transition-transform hover:-translate-y-0.5 ${item.link ? focusRing : ''}`}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-warm">
                          {item.kind === 'listing' ? 'Listing' : 'Request'} · {date}
                        </p>
                        <p className="mt-1 truncate text-sm font-bold">{item.title}</p>
                        <p className="mt-0.5 truncate text-xs capitalize text-warm">{item.sub}</p>
                        <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${done ? 'bg-sage/20 text-forest' : 'bg-gold/20 text-bark'}`}>
                          {item.status?.toLowerCase()}
                        </span>
                      </Wrapper>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* Quick links */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          {QUICK_LINKS.map(({ to, icon: Icon, label, onClick }) => {
            const cls = `flex min-h-[92px] w-full flex-col items-center justify-center rounded-[24px_24px_24px_8px] p-4 transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${glass} ${focusRing}`
            const body = (
              <>
                <Icon className="h-6 w-6 text-terracotta" aria-hidden="true" />
                <span className="mt-1.5 text-center text-xs font-bold">{onClick && becomingProvider ? 'Saving…' : label}</span>
              </>
            )
            return onClick
              ? <button key={label} type="button" onClick={onClick} disabled={becomingProvider} className={cls}>{body}</button>
              : <Link key={label} to={to} className={cls}>{body}</Link>
          })}
        </div>

        {/* Coming soon: quieter, doesn't compete with the main actions */}
        <div className="grid grid-cols-2 gap-3">
          {[{ icon: AcademicCapIcon, label: 'Student Hostels' }, { icon: BuildingLibraryIcon, label: 'Mortgages' }].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-[20px_20px_20px_8px] border border-dashed border-line bg-white/40 p-3">
              <Icon className="h-5 w-5 flex-shrink-0 text-warm" aria-hidden="true" />
              <span className="flex-1 text-xs font-bold text-warm">{label}</span>
              <span className="flex-shrink-0 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-bark">Coming Soon</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
