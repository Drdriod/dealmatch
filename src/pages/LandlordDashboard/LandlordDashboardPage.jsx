import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowPathIcon, BuildingOffice2Icon, ClipboardDocumentListIcon, EyeIcon, HomeModernIcon, KeyIcon, PauseIcon, PlayIcon,
} from '@heroicons/react/24/outline'
import { setListingStatus } from '@/data/landlordRepository'
import { useLandlordDashboard } from '@/hooks/useLandlordDashboard'
import LoadNotice from '@/components/ui/LoadNotice'
import { useAuth } from '@/context/AuthContext'
import { BarChart, ChartTheme, Donut, KpiTile, Panel, fmtNum, fmtNaira } from '@/components/charts/ChartKit'
import toast from 'react-hot-toast'

const glass = 'border border-white/70 bg-white/80 shadow-card backdrop-blur-xl'
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'

const TONES = {
  good:  'bg-sage/20 text-forest',
  warn:  'bg-gold/20 text-bark',
  bad:   'bg-terracotta/15 text-terracotta-dark',
  muted: 'bg-warm/15 text-warm',
}
const STATUS_STYLES = {
  active:         { tone: 'good',  label: 'Active' },
  pending_review: { tone: 'warn',  label: 'Under Review' },
  paused:         { tone: 'muted', label: 'Paused' },
  rejected:       { tone: 'bad',   label: 'Rejected' },
  sold:           { tone: 'good',  label: 'Sold' },
}

const RENT_MONTHS = 6
const slotKey = (d) => `${d.getFullYear()}-${d.getMonth()}`
const monthSlots = (n) => {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return { key: slotKey(d), label: d.toLocaleString('en-GB', { month: 'short' }) }
  })
}
const monthlyRent = (p) => {
  const v = Number(p.price) || 0
  return p.price_period === 'year' ? v / 12 : v
}
const occupancyBadge = (p) => {
  if (p.status === 'pending_review') return { text: 'Under review', tone: 'warn' }
  if (p.occupancy_status === 'occupied') return { text: 'Occupied', tone: 'good' }
  return { text: 'Vacant', tone: 'bad' }
}
const rentBadge = (p, paidThisMonth) => {
  const due = p.occupancy_status === 'occupied' && p.status !== 'pending_review' ? monthlyRent(p) : 0
  if (!due) return { text: 'No rent due', tone: 'muted' }
  if (paidThisMonth >= due) return { text: 'Paid', tone: 'good' }
  if (paidThisMonth > 0) return { text: 'Partial', tone: 'warn' }
  return { text: 'Unpaid', tone: 'bad' }
}

export default function LandlordDashboardPage() {
  const { user } = useAuth()
  const [tab,         setTab]         = useState('listings')
  const [selectedProp, setSelectedProp] = useState('all')
  // Loading, error and the four lists come from the hook; this page only lays them out.
  const { listings, bookings, enquiries, rentPayments, loading, error, issues, reload } = useLandlordDashboard(user)

  const togglePause = async (listing) => {
    const newStatus = listing.status === 'active' ? 'paused' : 'active'
    const { error } = await setListingStatus(listing.id, newStatus)
    if (error) { toast.error('We couldn\'t update that listing. Please try again.'); return }
    toast.success(`Listing ${newStatus === 'active' ? 'activated' : 'paused'}.`)
    reload({ silent: true })
  }

  const totalRevenue = bookings.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const activeCount  = listings.filter(l => l.status === 'active').length

  // ── Portfolio derivations (all from the queries above, no estimates beyond what is labelled) ──
  const slots      = monthSlots(RENT_MONTHS)
  const currentKey = slots[slots.length - 1].key
  const rentals    = listings.filter(l => l.category === 'rental' && l.status !== 'rejected' && l.status !== 'sold')

  const paidFor = (key, ids) => rentPayments
    .filter(e => slotKey(new Date(e.created_at)) === key && ids.has(e.property_id))
    .reduce((s, e) => s + (Number(e.gross_amount) || 0), 0)
  const dueFor = (pool) => pool
    .filter(p => p.occupancy_status === 'occupied')
    .reduce((s, p) => s + monthlyRent(p), 0)

  const pool    = selectedProp === 'all' ? rentals : rentals.filter(p => p.id === selectedProp)
  const poolIds = new Set(pool.map(p => p.id))
  const allIds  = new Set(rentals.map(p => p.id))

  // Due is the current monthly rent on occupied units; no rent schedule exists yet, so it is applied to each month.
  const rentSeries = slots.map(s => {
    const due = dueFor(pool)
    const collected = paidFor(s.key, poolIds)
    return { label: s.label, collected, outstanding: Math.max(due - collected, 0) }
  })
  const collectedByMonth = slots.map(s => paidFor(s.key, allIds))
  const collected6m     = collectedByMonth.reduce((s, v) => s + v, 0)
  const enquiriesByMonth = slots.map(s => enquiries.filter(e => slotKey(new Date(e.created_at)) === s.key).length)
  const listingsByMonth  = slots.map(s => listings.filter(l => slotKey(new Date(l.created_at)) === s.key).length)
  const rentPeriodTotal  = rentSeries.reduce((s, r) => s + r.collected + r.outstanding, 0)
  const rentPeriodHasData = rentPeriodTotal > 0

  const pendingReview = rentals.filter(p => p.status === 'pending_review').length
  const occupiedCount = rentals.filter(p => p.status !== 'pending_review' && p.occupancy_status === 'occupied').length
  const vacantCount   = rentals.filter(p => p.status !== 'pending_review' && p.occupancy_status !== 'occupied').length
  const occupancySlices = [
    { label: 'Occupied',       value: occupiedCount,  color: 'var(--dm-forest)' },
    { label: 'Vacant',         value: vacantCount,    color: 'var(--dm-terracotta)' },
    { label: 'Pending review', value: pendingReview,  color: 'var(--dm-gold)' },
  ]

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream pb-28 pt-20 text-deep">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/10 blur-3xl" />
        <div className="absolute -right-20 top-[34rem] h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/15 blur-3xl" />
      </div>
      <ChartTheme tone="light">
      <div className="relative mx-auto max-w-2xl px-4">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">Manage your offers. Track your deals.</h1>
            <p className="mt-0.5 text-xs text-warm">Keep your offers organised, monitor interest and manage your transactions from one place.</p>
          </div>
          <button type="button" onClick={() => reload()} aria-label="Refresh" className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${glass} ${focusRing}`}>
            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <LoadNotice error={error} issues={issues} onRetry={reload} what="your dashboard" className="mb-4" />

        {loading ? <div className="py-12 text-center text-warm" role="status">Loading your dashboard…</div> : null}

        {!loading && (
          <>
            <section className={`mb-6 rounded-[36px_36px_36px_12px] p-4 ${glass}`} aria-label="Portfolio">
              <div className="mb-4 flex items-end justify-between px-1">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-dark">Portfolio</p>
                  <h2 className="mt-1 font-display text-xl">Rent and occupancy</h2>
                </div>
                <p className="text-right text-[11px] text-warm">Last {RENT_MONTHS} months<br />Bookings {fmtNaira(totalRevenue)}</p>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <KpiTile label="Rent collected" value={fmtNaira(collected6m)} spark={collectedByMonth} color="var(--dm-gold)" />
                <KpiTile label="Active listings" value={activeCount} spark={listingsByMonth} color="var(--dm-forest)" />
                <div className="col-span-2">
                  <KpiTile label="Enquiries" value={enquiries.length} spark={enquiriesByMonth} color="var(--dm-terracotta)" />
                </div>
              </div>

              <Panel title="Rent collected vs due" sub={`Monthly, ${pool.length === rentals.length ? 'all rental properties' : 'selected property'} · due = current rent on occupied units`} className="mb-3">
                {rentals.length === 0 ? (
                  <p className="py-8 text-center text-xs text-warm">Create a rental offer to start tracking rent against it.</p>
                ) : (
                  <>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3" style={{ scrollbarWidth: 'none' }}>
                      {[{ id: 'all', title: 'All properties' }, ...rentals.map(p => ({ id: p.id, title: p.title }))].map(c => (
                        <button key={c.id} type="button" onClick={() => setSelectedProp(c.id)} aria-pressed={selectedProp === c.id}
                          className={`max-w-[10rem] flex-shrink-0 truncate rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${focusRing} ${selectedProp === c.id ? 'bg-terracotta-dark text-white' : 'border border-line bg-white/80 text-bark'}`}>
                          {c.title}
                        </button>
                      ))}
                    </div>
                    <BarChart data={rentSeries} stacked format={fmtNum} height={200}
                      series={[
                        { key: 'collected',   label: 'Collected',   color: 'var(--dm-forest)' },
                        { key: 'outstanding', label: 'Outstanding', color: 'var(--dm-terracotta)' },
                      ]} />
                    <div className="mt-3 flex items-center gap-4 text-[11px] text-warm">
                      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-forest" />Collected</span>
                      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-terracotta" />Outstanding</span>
                    </div>
                    {!rentPeriodHasData ? <p className="mt-2 text-[11px] text-warm">No rent due or collected in the last {RENT_MONTHS} months.</p> : null}
                  </>
                )}
              </Panel>

              <Panel title="Occupancy" sub="Rental listings by current state">
                {rentals.length === 0 ? (
                  <p className="py-6 text-center text-xs text-warm">You haven&apos;t published a rental offer yet.</p>
                ) : (
                  <div className="flex items-center gap-5">
                    <Donut slices={occupancySlices} size={136} thickness={18} center={rentals.length} centerSub="rentals" />
                    <div className="min-w-0 flex-1 space-y-3">
                      {occupancySlices.map(sl => (
                        <div key={sl.label} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-2 text-bark"><i className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: sl.color }} /><span className="truncate">{sl.label}</span></span>
                          <span className="font-bold">{sl.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </section>

            <div className="mb-6 grid grid-cols-3 gap-3">
              {[
                { to: '/list', label: 'For Sale', icon: HomeModernIcon },
                { to: '/list-rental', label: 'Rental', icon: KeyIcon },
                { to: '/list-rental?type=hotel', label: 'Hotel', icon: BuildingOffice2Icon },
              ].map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className={`flex flex-col items-center gap-2 rounded-[24px_24px_24px_8px] border-2 border-dashed border-terracotta/35 bg-orange-pale p-4 text-terracotta-dark transition-transform hover:-translate-y-0.5 ${focusRing}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span className="text-xs font-semibold">+ {label}</span>
                </Link>
              ))}
            </div>

            <section className="mb-6" aria-label="Rental properties">
              <div className="mb-3 flex items-baseline justify-between px-1">
                <h2 className="font-display text-lg">Rental properties</h2>
                <p className="text-xs text-warm">{listings.length} listing{listings.length === 1 ? '' : 's'} total</p>
              </div>
              <div className={`overflow-hidden rounded-[28px_28px_28px_10px] ${glass}`}>
                {rentals.length === 0 ? (
                  <div className="p-8 text-center">
                    <KeyIcon className="mx-auto mb-3 h-9 w-9 text-terracotta" aria-hidden="true" />
                    <p className="text-sm font-semibold">You haven&apos;t published a rental offer yet.</p>
                    <Link to="/list-rental" className="btn-primary mt-4 inline-flex px-6 py-2.5 text-sm">Create Your First Offer →</Link>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line px-4 py-2.5 text-[10px] uppercase tracking-wider text-warm">
                      <span>Property</span><span>Occupancy</span><span>This month</span>
                    </div>
                    {rentals.map(p => {
                      const occ  = occupancyBadge(p)
                      const paid = paidFor(currentKey, new Set([p.id]))
                      const rent = rentBadge(p, paid)
                      return (
                        <Link key={p.id} to={`/property/${p.id}`} className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${focusRing}`}>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{p.title}</p>
                            <p className="mt-0.5 truncate text-[11px] text-warm">{p.city}, {p.state} · {fmtNaira(monthlyRent(p))}{p.price_period === 'year' ? '/yr' : '/mo'}</p>
                          </div>
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${TONES[occ.tone]}`}>{occ.text}</span>
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${TONES[rent.tone]}`}>{rent.text}</span>
                        </Link>
                      )
                    })}
                  </>
                )}
              </div>
            </section>

            <div className="mb-5 flex gap-2" role="tablist" aria-label="Offers or bookings">
              {[['listings', 'My Offers'], ['bookings', 'Bookings']].map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                  className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${focusRing} ${tab === v ? 'border-deep bg-deep text-white' : 'border-line bg-white/80 text-bark'}`}>{l}</button>
              ))}
            </div>
          </>
        )}

        {!loading && tab === 'listings' && (
          <div className="space-y-3">
            {listings.length === 0 ? (
              <div className={`rounded-[28px_28px_28px_10px] p-10 text-center ${glass}`}>
                <HomeModernIcon className="mx-auto mb-3 h-10 w-10 text-terracotta" aria-hidden="true" />
                <p className="text-sm font-semibold">You haven&apos;t published an offer yet.</p>
                <Link to="/list" className="btn-primary mt-4 inline-flex px-6 py-2.5 text-sm">Create Your First Offer →</Link>
              </div>
            ) : listings.map(l => {
              const st = STATUS_STYLES[l.status] || STATUS_STYLES.paused
              return (
                <div key={l.id} className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.title}</p>
                      <p className="mt-0.5 text-xs text-warm">{l.city}, {l.state} · ₦{Number(l.price).toLocaleString()}</p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${TONES[st.tone]}`}>{st.label}</span>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/property/${l.id}`} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-bark ${focusRing}`}>
                      <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" /> View
                    </Link>
                    {(l.status === 'active' || l.status === 'paused') && (
                      <button type="button" onClick={() => togglePause(l)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-bark ${focusRing}`}>
                        {l.status === 'active' ? <PauseIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <PlayIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                        {l.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                    )}
                    {(l.category === 'hotel' || l.category === 'shortlet' || l.category === 'rental') && (
                      <Link to="/availability" className={`flex items-center gap-1.5 rounded-xl border border-terracotta bg-orange-pale px-3 py-2 text-xs font-semibold text-terracotta-dark ${focusRing}`}>
                        {l.category === 'rental' ? 'Occupancy' : 'Rooms'}
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && tab === 'bookings' && (
          <div className="space-y-3">
            {bookings.length === 0 ? (
              <div className={`rounded-[28px_28px_28px_10px] p-10 text-center ${glass}`}>
                <ClipboardDocumentListIcon className="mx-auto mb-3 h-10 w-10 text-terracotta" aria-hidden="true" />
                <p className="text-sm font-semibold">You don&apos;t have any bookings yet.</p>
              </div>
            ) : bookings.map(b => (
              <div key={b.id} className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{b.guest_name}</p>
                    <p className="mt-0.5 text-xs text-warm">{b.properties?.title}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${b.status === 'confirmed' ? TONES.good : TONES.warn}`}>{b.status}</span>
                </div>
                <div className="text-xs text-warm">
                  {b.checkin_date} → {b.checkout_date} · {b.guest_phone}
                  {b.total_amount ? ` · ₦${Number(b.total_amount).toLocaleString()}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </ChartTheme>
    </div>
  )
}
