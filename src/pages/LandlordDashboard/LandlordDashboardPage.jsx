import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Eye, Home, Hotel, Key, Pause, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { BarChart, Donut, KpiTile, Panel, fmtNum, fmtNaira } from '@/components/charts/ChartKit'
import toast from 'react-hot-toast'

const STATUS_STYLES = {
  active:         { bg: 'rgba(122,158,126,0.12)', color: '#5C8060',  label: 'Active' },
  pending_review: { bg: 'rgba(212,168,83,0.12)',  color: '#8A6A20',  label: 'Under Review' },
  paused:         { bg: 'rgba(23,33,27,0.08)',    color: '#647068',  label: 'Paused' },
  rejected:       { bg: 'rgba(200,95,45,0.12)',  color: '#C85F2D',  label: 'Rejected' },
  sold:           { bg: 'rgba(122,158,126,0.12)', color: '#5C8060',  label: 'Sold' },
}

// Badge tones for the portfolio table, which sits on the cream surface.
const TONES = {
  good:  { bg: 'rgba(122,158,126,0.12)', color: '#5C8060' },
  warn:  { bg: 'rgba(212,168,83,0.12)',  color: '#8A6A20' },
  bad:   { bg: 'rgba(200,95,45,0.12)',   color: '#C85F2D' },
  muted: { bg: 'rgba(23,33,27,0.08)',    color: '#647068' },
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
  const { user, profile } = useAuth()
  const [listings,    setListings]    = useState([])
  const [bookings,    setBookings]    = useState([])
  const [enquiries,   setEnquiries]   = useState([])
  const [rentPayments, setRentPayments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState('listings')
  const [selectedProp, setSelectedProp] = useState('all')

  useEffect(() => { if (user) loadAll() }, [user])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadListings(), loadBookings(), loadEnquiries(), loadRentPayments()])
    setLoading(false)
  }

  const loadListings = async () => {
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false })
    setListings(data || [])
  }

  const loadBookings = async () => {
    const { data } = await supabase
      .from('bookings')
      .select('*, properties(title, city, state, category)')
      .in('property_id',
        (await supabase.from('properties').select('id').eq('seller_id', user.id)).data?.map(p => p.id) || []
      )
      .order('created_at', { ascending: false })
      .limit(20)
    setBookings(data || [])
  }

  const loadEnquiries = async () => {
    const { data: props } = await supabase.from('properties').select('id').eq('seller_id', user.id)
    const ids = (props || []).map(p => p.id)
    if (!ids.length) { setEnquiries([]); return }
    const { data } = await supabase
      .from('rental_enquiries')
      .select('id, property_id, status, created_at')
      .in('property_id', ids)
      .order('created_at', { ascending: false })
      .limit(200)
    setEnquiries(data || [])
  }

  // Rent collected: rental escrow deposits the landlord can see (funded or released).
  const loadRentPayments = async () => {
    const { data } = await supabase
      .from('escrow_transactions')
      .select('id, property_id, gross_amount, status, created_at')
      .eq('seller_id', user.id)
      .eq('transaction_type', 'rental')
      .in('status', ['funded', 'completed'])
      .order('created_at', { ascending: false })
      .limit(500)
    setRentPayments(data || [])
  }

  const togglePause = async (listing) => {
    const newStatus = listing.status === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('properties').update({ status: newStatus }).eq('id', listing.id)
    if (error) { toast.error('Update failed'); return }
    toast.success(`Listing ${newStatus === 'active' ? 'activated' : 'paused'}`)
    loadListings()
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
    { label: 'Occupied',       value: occupiedCount,  color: '#7A9E7E' },
    { label: 'Vacant',         value: vacantCount,    color: '#C85F2D' },
    { label: 'Pending review', value: pendingReview,  color: '#D4A853' },
  ]

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color: '#17211B' }}>
              Landlord Dashboard
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#647068' }}>Manage your properties</p>
          </div>
          <button onClick={loadAll}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(23,33,27,0.08)' }}>
            <RefreshCw size={16} style={{ color: '#5C4A3A' }} />
          </button>
        </div>

        {loading && <div className="text-center py-12" style={{ color: '#647068' }}>Loading...</div>}

        {!loading && (
          <>
            {/* Portfolio */}
            <section className="rounded-3xl p-4 mb-6" style={{ backgroundColor: '#17211B' }}>
              <div className="flex items-end justify-between px-1 mb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: '#D4A853' }}>Portfolio</p>
                  <h2 className="font-display text-xl mt-1" style={{ color: '#FFFAF5' }}>Rent and occupancy</h2>
                </div>
                <p className="text-[11px] text-right" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Last {RENT_MONTHS} months<br />Bookings {fmtNaira(totalRevenue)}
                </p>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <KpiTile label="Rent collected" value={fmtNaira(collected6m)} spark={collectedByMonth} color="#D4A853" />
                <KpiTile label="Active listings" value={activeCount} spark={listingsByMonth} color="#7A9E7E" />
                <div className="col-span-2">
                  <KpiTile label="Enquiries" value={enquiries.length} spark={enquiriesByMonth} color="#C85F2D" />
                </div>
              </div>

              {/* Rent collected vs due */}
              <Panel title="Rent collected vs due" sub={`Monthly, ${pool.length === rentals.length ? 'all rental properties' : 'selected property'} · due = current rent on occupied units`} className="mb-3">
                {rentals.length === 0 ? (
                  <p className="text-xs py-8 text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Add a rental listing to start tracking rent against it.
                  </p>
                ) : (
                  <>
                    <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                      {[{ id: 'all', title: 'All properties' }, ...rentals.map(p => ({ id: p.id, title: p.title }))].map(c => {
                        const on = selectedProp === c.id
                        return (
                          <button key={c.id} onClick={() => setSelectedProp(c.id)}
                            className="flex-shrink-0 max-w-[10rem] truncate px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                            style={{
                              backgroundColor: on ? '#D4A853' : 'rgba(255,255,255,0.06)',
                              color:           on ? '#17211B' : 'rgba(255,255,255,0.7)',
                            }}>
                            {c.title}
                          </button>
                        )
                      })}
                    </div>
                    <BarChart
                      data={rentSeries}
                      stacked
                      format={fmtNum}
                      height={200}
                      series={[
                        { key: 'collected',   label: 'Collected',   color: '#7A9E7E' },
                        { key: 'outstanding', label: 'Outstanding', color: '#C85F2D' },
                      ]}
                    />
                    <div className="flex items-center gap-4 mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: '#7A9E7E' }} />Collected</span>
                      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: '#C85F2D' }} />Outstanding</span>
                    </div>
                    {!rentPeriodHasData && (
                      <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        No rent due or collected in the last {RENT_MONTHS} months.
                      </p>
                    )}
                  </>
                )}
              </Panel>

              {/* Occupancy */}
              <Panel title="Occupancy" sub="Rental listings by current state">
                {rentals.length === 0 ? (
                  <p className="text-xs py-6 text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>No rental listings yet.</p>
                ) : (
                  <div className="flex items-center gap-5">
                    <Donut slices={occupancySlices} size={136} thickness={18} center={rentals.length} centerSub="rentals" />
                    <div className="flex-1 min-w-0 space-y-3">
                      {occupancySlices.map(s => (
                        <div key={s.label} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-2 min-w-0" style={{ color: 'rgba(255,255,255,0.75)' }}>
                            <i className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                            <span className="truncate">{s.label}</span>
                          </span>
                          <span className="font-bold text-white">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </section>

            {/* Add listing shortcuts */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { to: '/list',             label: 'For Sale',  icon: <Home size={24} className="text-terracotta" /> },
                { to: '/list-rental',      label: 'Rental',    icon: <Key size={24} className="text-terracotta" /> },
                { to: '/list-rental?type=hotel', label: 'Hotel', icon: <Hotel size={24} className="text-terracotta" /> },
              ].map(l => (
                <Link key={l.to} to={l.to}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-dashed transition-all"
                  style={{ borderColor: 'rgba(200,95,45,0.3)', color: '#C85F2D', backgroundColor: 'rgba(200,95,45,0.03)' }}>
                  <span>{l.icon}</span>
                  <span className="text-xs font-semibold">+ {l.label}</span>
                </Link>
              ))}
            </div>

            {/* Property table */}
            <section className="mb-6">
              <div className="flex items-baseline justify-between mb-3 px-1">
                <h2 className="font-display text-lg font-black" style={{ color: '#17211B' }}>Rental properties</h2>
                <p className="text-xs" style={{ color: '#647068' }}>{listings.length} listing{listings.length === 1 ? '' : 's'} total</p>
              </div>
              <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
                {rentals.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="flex justify-center mb-3"><Key size={36} className="text-terracotta" /></div>
                    <p className="font-semibold text-sm" style={{ color: '#17211B' }}>No rental properties yet</p>
                    <Link to="/list-rental" className="btn-primary text-sm px-6 py-2.5 inline-flex mt-4">List Rental →</Link>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider"
                      style={{ color: '#647068', borderBottom: '1px solid #DEDDD6' }}>
                      <span>Property</span>
                      <span>Occupancy</span>
                      <span>This month</span>
                    </div>
                    {rentals.map(p => {
                      const occ  = occupancyBadge(p)
                      const paid = paidFor(currentKey, new Set([p.id]))
                      const rent = rentBadge(p, paid)
                      return (
                        <Link key={p.id} to={`/property/${p.id}`}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3"
                          style={{ borderBottom: '1px solid #DEDDD6' }}>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate" style={{ color: '#17211B' }}>{p.title}</p>
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: '#647068' }}>
                              {p.city}, {p.state} · {fmtNaira(monthlyRent(p))}{p.price_period === 'year' ? '/yr' : '/mo'}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                            style={{ backgroundColor: TONES[occ.tone].bg, color: TONES[occ.tone].color }}>{occ.text}</span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap flex items-center gap-1"
                            style={{ backgroundColor: TONES[rent.tone].bg, color: TONES[rent.tone].color }}>
                            {rent.text}
                          </span>
                        </Link>
                      )
                    })}
                  </>
                )}
              </div>
            </section>

            {/* Tabs */}
            <div className="flex gap-2 mb-5">
              {[['listings','My Listings'],['bookings','Bookings']].map(([v,l]) => (
                <button key={v} onClick={() => setTab(v)}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold border transition-all"
                  style={{
                    backgroundColor: tab === v ? '#17211B' : '#FFFFFF',
                    color:           tab === v ? '#FFFFFF'  : '#5C4A3A',
                    borderColor:     tab === v ? '#17211B'  : '#DEDDD6',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Listings tab */}
        {!loading && tab === 'listings' && (
          <div className="space-y-3">
            {listings.length === 0 ? (
              <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
                <div className="flex justify-center mb-3"><Home size={40} className="text-terracotta" /></div>
                <p className="font-semibold text-sm" style={{ color: '#17211B' }}>No listings yet</p>
                <Link to="/list" className="btn-primary text-sm px-6 py-2.5 inline-flex mt-4">List Property →</Link>
              </div>
            ) : listings.map(l => {
              const s = STATUS_STYLES[l.status] || STATUS_STYLES.paused
              return (
                <div key={l.id} className="rounded-2xl border p-4"
                  style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: '#17211B' }}>{l.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#647068' }}>
                        {l.city}, {l.state} · ₦{Number(l.price).toLocaleString()}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/property/${l.id}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border flex-1 justify-center"
                      style={{ borderColor: '#DEDDD6', color: '#5C4A3A', backgroundColor: '#FFFFFF' }}>
                      <Eye size={12} /> View
                    </Link>
                    {(l.status === 'active' || l.status === 'paused') && (
                      <button onClick={() => togglePause(l)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border flex-1 justify-center"
                        style={{ borderColor: '#DEDDD6', color: '#5C4A3A', backgroundColor: '#FFFFFF' }}>
                        <Pause size={12} /> {l.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                    )}
                    {(l.category === 'hotel' || l.category === 'shortlet' || l.category === 'rental') && (
                      <Link to="/availability"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
                        style={{ borderColor: '#C85F2D', color: '#C85F2D', backgroundColor: 'rgba(200,95,45,0.04)' }}>
                        {l.category === 'rental' ? 'Occupancy' : 'Rooms'}
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Bookings tab */}
        {!loading && tab === 'bookings' && (
          <div className="space-y-3">
            {bookings.length === 0 ? (
              <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
                <div className="flex justify-center mb-3"><ClipboardList size={40} className="text-terracotta" /></div>
                <p className="font-semibold text-sm" style={{ color: '#17211B' }}>No bookings yet</p>
              </div>
            ) : bookings.map(b => (
              <div key={b.id} className="rounded-2xl border p-4"
                style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#17211B' }}>{b.guest_name}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#647068' }}>{b.properties?.title}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                    style={{
                      backgroundColor: b.status === 'confirmed' ? 'rgba(122,158,126,0.12)' : 'rgba(212,168,83,0.12)',
                      color:           b.status === 'confirmed' ? '#5C8060' : '#8A6A20',
                    }}>
                    {b.status}
                  </span>
                </div>
                <div className="text-xs" style={{ color: '#647068' }}>
                  {b.checkin_date} → {b.checkout_date} · {b.guest_phone}
                  {b.total_amount ? ` · ₦${Number(b.total_amount).toLocaleString()}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
