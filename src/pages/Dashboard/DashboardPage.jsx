import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Award, Briefcase, Building2, CheckCircle2, Circle, ClipboardList, GraduationCap, HardHat, Heart, Home, Landmark, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  fetchMyPropertyListings, fetchMyCategoryListings, fetchMyRequests, countMyMatches,
  countMySwipeLikes, countCompletedEscrowSales, countCompletedProviderTransactions,
  fetchMyPropertyDatesSince, fetchRequestDatesSince, subscribeToMySwipes, markOfferingServices,
} from '@/data/dashboardRepository'
import { CHART, Radial, KpiTile } from '@/components/charts/ChartKit'
import toast from 'react-hot-toast'

const SPARK_WEEKS = 8
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const ACTIVE_STATUSES = ['active', 'ACTIVE', 'completed', 'COMPLETED']
const CARD = { background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }
const MUTED = 'rgba(255,255,255,0.55)'
const FAINT = 'rgba(255,255,255,0.4)'

// Buckets created_at timestamps into weekly counts, oldest week first.
function weeklyCounts(rows) {
  const buckets = new Array(SPARK_WEEKS).fill(0)
  const now = Date.now()
  rows.forEach((r) => {
    const age = now - new Date(r.created_at).getTime()
    const idx = SPARK_WEEKS - 1 - Math.floor(age / WEEK_MS)
    if (idx >= 0 && idx < SPARK_WEEKS) buckets[idx] += 1
  })
  return buckets
}

export default function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [myListingsCount, setMyListingsCount] = useState(0)
  const [myRequestsCount, setMyRequestsCount] = useState(0)
  const [myMatches,       setMyMatches]       = useState(0)
  const [completedDeals,  setCompletedDeals]  = useState(0)
  const [activity,        setActivity]        = useState([]) // combined recent listings + requests
  const [listingTrend,    setListingTrend]    = useState(() => new Array(SPARK_WEEKS).fill(0))
  const [enquiryTrend,    setEnquiryTrend]    = useState(() => new Array(SPARK_WEEKS).fill(0))
  const [loading,         setLoading]         = useState(true)
  const [becomingProvider, setBecomingProvider] = useState(false)

  useEffect(() => {
    if (!user) return
    loadDashboard()
    return subscribeToMySwipes(user.id, () => loadDashboard())
  }, [user])

  const loadDashboard = async () => {
    try {
      const since = new Date(Date.now() - SPARK_WEEKS * WEEK_MS).toISOString()
      const [propListings, catListings, myRequests, matchRes, escrowRes, txRes, propTrend, reqTrend] = await Promise.all([
        fetchMyPropertyListings(user.id),
        fetchMyCategoryListings(user.id),
        fetchMyRequests(),
        countMyMatches(user.id),
        countCompletedEscrowSales(user.id),
        countCompletedProviderTransactions(user.id),
        // Trend queries for the sparkline tiles: creation dates over the last SPARK_WEEKS weeks
        fetchMyPropertyDatesSince(user.id, since),
        fetchRequestDatesSince(since),
      ])

      const properties = propListings.data || []
      const categoryListings = catListings || []
      const requests = myRequests.data || []

      setMyListingsCount(properties.length + categoryListings.length)
      setMyRequestsCount(requests.length)
      setListingTrend(weeklyCounts([...(propTrend.data || []), ...categoryListings]))
      setEnquiryTrend(weeklyCounts(reqTrend.data || []))

      // Matches: prefer the `matches` table's exact count; fall back to
      // swipes if that RPC/table path errors (same fallback the previous
      // version used, preserved here).
      if (!matchRes.error) {
        setMyMatches(matchRes.count || 0)
      } else {
        const { count: sc } = await countMySwipeLikes(user.id)
        setMyMatches(sc || 0)
      }

      setCompletedDeals((escrowRes.count || 0) + (txRes.count || 0))

      // My Activity: merge recent listings (both kinds) + recent requests
      // into one chronological feed, capped to 6 for the dashboard card.
      const listingActivity = [
        ...properties.map(p => ({ kind: 'listing', id: p.id, title: p.title, sub: `₦${Number(p.price).toLocaleString()} · ${p.category}`, status: p.status, at: p.created_at, link: `/property/${p.id}` })),
        ...categoryListings.map(l => ({ kind: 'listing', id: l.id, title: l.title, sub: l.type, status: l.status, at: l.created_at, link: null })),
      ]
      const requestActivity = requests.map(r => ({ kind: 'request', id: r.request_id, title: r.title, sub: r.request_type, status: r.status, at: r.created_at, link: null }))
      setActivity([...listingActivity, ...requestActivity].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6))
    } catch (err) {
      console.error('loadDashboard error:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const verificationLevel = profile?.is_live_verified ? 'live' : profile?.avatar_url ? 'photo' : 'none'
  const isProvider = !!profile?.offers_services

  // "Become a Provider" is a real, honest toggle (see migration comment):
  // clicking it records intent immediately, then sends the person straight
  // into actual verification -- saying yes never grants provider status by
  // itself, it just starts the real process.
  const handleBecomeProvider = async () => {
    if (!user) return
    setBecomingProvider(true)
    const { error } = await markOfferingServices(user.id)
    setBecomingProvider(false)
    if (error) { toast.error('Could not save. Try again.'); return }
    await refreshProfile()
    toast.success("You're on your way to becoming a provider!")
    navigate('/verify-skill')
  }

  const QUICK_LINKS = [
    { to: '/rentals',       icon: <Building2 size={22} className="text-terracotta" />, label: 'Browse Places',     active: true },
    { to: '/find-provider', icon: <HardHat size={22} className="text-terracotta" />,  label: 'Browse Providers',  active: true },
    { to: '/request',       icon: <ClipboardList size={22} className="text-terracotta" />, label: 'Post a Request', active: true },
    { to: '/matches',       icon: <Heart size={22} className="text-terracotta" />,    label: 'My Matches',        active: true },
    isProvider
      ? { to: '/verify-skill', icon: <Award size={22} className="text-terracotta" />, label: 'My Provider Status', active: true }
      : { to: null, icon: <Briefcase size={22} className="text-terracotta" />, label: 'Become a Provider', active: true, onClick: handleBecomeProvider },
    { to: '/manage-listings', icon: <Home size={22} className="text-terracotta" />,    label: 'My Listings',       active: true },
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
    { key: 'post', done: myListingsCount + myRequestsCount > 0, title: 'Post a request or list your offer', sub: 'Get your first match moving', to: '/request' },
    isProvider
      ? { key: 'provider', done: true, title: 'Provider status', sub: 'Review your provider profile', to: '/verify-skill' }
      : { key: 'provider', done: false, title: 'Become a Provider', sub: 'Starts real verification. It does not grant access by itself', onClick: handleBecomeProvider },
  ]
  const nextIdx = steps.findIndex(s => !s.done)

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#17211B' }}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Journey hero: greeting plus two progress rings */}
        <section className="rounded-3xl p-5 mb-4"
          style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.18), rgba(255,255,255,0.03) 62%)', border: '1px solid rgba(212,168,83,0.25)' }}>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: CHART.indicator }}>Your journey</p>
          <h1 className="font-display text-3xl mt-1" style={{ color: '#FFFAF5' }}>Hey, {firstName}</h1>
          <p className="text-sm mt-1" style={{ color: MUTED }}>Here's your DealMatch overview</p>

          <div className="flex items-start justify-around mt-5">
            <div className="flex flex-col items-center gap-2">
              <Radial value={profileDone} max={3} size={104} color={CHART.palette[1]}
                label={`${Math.round((profileDone / 3) * 100)}%`} sub={`${profileDone} of 3`} />
              <p className="text-xs font-semibold" style={{ color: '#FFFAF5' }}>Profile</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Radial value={verifyScore} max={2} size={104} color={CHART.palette[0]}
                label={`${Math.round((verifyScore / 2) * 100)}%`} sub={VERIFY_SUB[verificationLevel]} />
              <p className="text-xs font-semibold" style={{ color: '#FFFAF5' }}>Verification</p>
            </div>
          </div>
        </section>

        {/* Primary entry points */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Link to="/rentals" className="rounded-3xl p-5 flex flex-col justify-between transition-all hover:-translate-y-0.5"
            style={{ background: 'rgba(122,158,126,0.14)', border: '1px solid rgba(122,158,126,0.3)', minHeight: 140 }}>
            <Home size={26} style={{ color: CHART.palette[0] }} />
            <div>
              <p className="font-display text-lg leading-tight" style={{ color: '#FFFAF5' }}>Find a Place</p>
              <p className="text-xs mt-1" style={{ color: MUTED }}>Shortlets, rentals & housing</p>
            </div>
          </Link>
          <Link to="/find-provider" className="rounded-3xl p-5 flex flex-col justify-between transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: '#C85F2D', minHeight: 140 }}>
            <HardHat size={26} className="text-white" />
            <div>
              <p className="font-display text-lg leading-tight text-white">Find a Provider</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>Skilled people & services</p>
            </div>
          </Link>
        </div>

        {/* Next steps checklist */}
        <section className="rounded-2xl p-5 mb-4" style={CARD}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: CHART.indicator }}>Next steps</p>
          <h2 className="font-display text-xl mt-0.5 mb-4" style={{ color: '#FFFAF5' }}>
            {nextIdx === -1 ? "You're all set" : `${steps.filter(s => s.done).length} of ${steps.length} done`}
          </h2>
          <div className="space-y-2">
            {steps.map((s, i) => {
              const isNext = i === nextIdx
              const inner = (
                <>
                  {s.done
                    ? <CheckCircle2 size={20} style={{ color: CHART.palette[0] }} />
                    : <Circle size={20} style={{ color: CHART.indicator }} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold"
                      style={{ color: s.done ? MUTED : '#FFFAF5', textDecoration: s.done ? 'line-through' : 'none' }}>
                      {s.onClick && becomingProvider ? 'Saving…' : s.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: FAINT }}>{s.sub}</p>
                  </div>
                  <ArrowRight size={16} style={{ color: FAINT }} />
                </>
              )
              const rowClass = 'w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all disabled:opacity-60'
              const rowStyle = {
                border: isNext ? '1px solid rgba(212,168,83,0.45)' : '1px solid rgba(255,255,255,0.06)',
                background: isNext ? 'rgba(212,168,83,0.08)' : 'transparent',
              }
              return s.onClick ? (
                <button key={s.key} type="button" onClick={s.onClick} disabled={becomingProvider} className={rowClass} style={rowStyle}>
                  {inner}
                </button>
              ) : (
                <Link key={s.key} to={s.to} className={rowClass} style={rowStyle}>
                  {inner}
                </Link>
              )
            })}
          </div>
        </section>

        {/* Sparkline KPI tiles. Saved items have no data source in this page, so no tile. */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Link to="/manage-listings" className="block rounded-2xl transition-all hover:-translate-y-0.5">
            <KpiTile label="Listings" value={loading ? '–' : myListingsCount} icon={Home} color={CHART.palette[0]} spark={listingTrend} />
          </Link>
          <Link to="/request" className="block rounded-2xl transition-all hover:-translate-y-0.5">
            <KpiTile label="Enquiries" value={loading ? '–' : myRequestsCount} icon={ClipboardList} color={CHART.palette[1]} spark={enquiryTrend} />
          </Link>
          <Link to="/matches" className="block rounded-2xl transition-all hover:-translate-y-0.5">
            <KpiTile label="Matches" value={loading ? '–' : myMatches} icon={Heart} color={CHART.palette[2]} />
          </Link>
          <Link to="/wallet" className="block rounded-2xl transition-all hover:-translate-y-0.5">
            <KpiTile label="Completed" value={loading ? '–' : completedDeals} icon={Wallet} color={CHART.palette[3]} />
          </Link>
        </div>

        {/* Horizontal activity timeline */}
        <section className="rounded-2xl p-5 mb-4" style={CARD}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: CHART.indicator }}>Timeline</p>
          <h2 className="font-display text-xl mt-0.5 mb-4" style={{ color: '#FFFAF5' }}>Recent activity</h2>

          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#D4A853' }} />
            </div>
          ) : activity.length === 0 ? (
            <div className="py-6 text-center">
              <div className="flex justify-center mb-3"><ClipboardList size={36} className="text-terracotta" /></div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#FFFAF5' }}>No activity yet</p>
              <p className="text-xs mb-4" style={{ color: MUTED }}>Post what you need or list what you offer to get started.</p>
              <div className="flex gap-2 justify-center">
                <Link to="/request" className="btn-primary text-sm px-5 py-2.5">Post a Request</Link>
                <Link to="/list" className="px-5 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#FFFAF5' }}>
                  List What I Offer
                </Link>
              </div>
            </div>
          ) : (
            <div className="-mx-5 px-5 pb-2 overflow-x-auto" style={{ scrollSnapType: 'x mandatory' }}>
              <div className="relative flex gap-3 min-w-max">
                <div className="absolute top-[5px] left-0 right-0 h-px" style={{ background: 'rgba(212,168,83,0.3)' }} />
                {activity.map(item => {
                  const done = ACTIVE_STATUSES.includes(item.status)
                  const Wrapper = item.link ? Link : 'div'
                  const date = new Date(item.at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
                  return (
                    <div key={item.kind + item.id} className="relative shrink-0 w-56 pt-6" style={{ scrollSnapAlign: 'start' }}>
                      <span className="absolute top-0 left-0 w-2.5 h-2.5 rounded-full"
                        style={{ background: done ? CHART.palette[0] : CHART.indicator }} />
                      <Wrapper {...(item.link ? { to: item.link } : {})}
                        className="block h-full rounded-2xl p-3.5 transition-all hover:-translate-y-0.5" style={CARD}>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: FAINT }}>
                          {item.kind === 'listing' ? 'Listing' : 'Request'} · {date}
                        </p>
                        <p className="text-sm font-semibold truncate mt-1" style={{ color: '#FFFAF5' }}>{item.title}</p>
                        <p className="text-xs mt-0.5 capitalize truncate" style={{ color: MUTED }}>{item.sub}</p>
                        <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mt-3 capitalize"
                          style={{
                            backgroundColor: done ? 'rgba(122,158,126,0.18)' : 'rgba(212,168,83,0.15)',
                            color: done ? '#A9C7AD' : '#F3C96A',
                          }}>
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

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {QUICK_LINKS.map(({ to, icon, label, onClick }) => (
            <div key={label}>
              {onClick ? (
                <button onClick={onClick} disabled={becomingProvider}
                  className="w-full flex flex-col items-center justify-center p-4 rounded-3xl transition-all hover:-translate-y-0.5 disabled:opacity-60"
                  style={{ ...CARD, minHeight: 90 }}>
                  {icon}
                  <span className="text-xs font-semibold mt-1.5 text-center" style={{ color: '#FFFAF5' }}>
                    {becomingProvider ? 'Saving…' : label}
                  </span>
                </button>
              ) : (
                <Link to={to} className="flex flex-col items-center justify-center p-4 rounded-3xl transition-all hover:-translate-y-0.5"
                  style={{ ...CARD, minHeight: 90 }}>
                  {icon}
                  <span className="text-xs font-semibold mt-1.5 text-center" style={{ color: '#FFFAF5' }}>{label}</span>
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Coming Soon -- quieter, lower priority, doesn't compete with the main actions above */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <GraduationCap size={18} style={{ color: FAINT }} />, label: 'Student Hostels' },
            { icon: <Landmark size={18} style={{ color: FAINT }} />,      label: 'Mortgages' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 p-3 rounded-2xl border border-dashed opacity-60"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.12)' }}>
              {icon}
              <span className="text-xs font-medium flex-1" style={{ color: MUTED }}>{label}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: 'rgba(212,168,83,0.15)', color: '#F3C96A' }}>Coming Soon</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
