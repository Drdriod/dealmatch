import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, CheckCircle, ClipboardList, Eye, Home, Hotel, Key, Pause, Plus, RefreshCw, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const STATUS_STYLES = {
  active:         { bg: 'rgba(122,158,126,0.12)', color: '#5C8060',  label: 'Active' },
  pending_review: { bg: 'rgba(212,168,83,0.12)',  color: '#8A6A20',  label: 'Under Review' },
  paused:         { bg: 'rgba(26,18,16,0.08)',    color: '#8A7E78',  label: 'Paused' },
  rejected:       { bg: 'rgba(201,106,58,0.12)',  color: '#C96A3A',  label: 'Rejected' },
  sold:           { bg: 'rgba(122,158,126,0.12)', color: '#5C8060',  label: 'Sold' },
}

export default function LandlordDashboardPage() {
  const { user, profile } = useAuth()
  const [listings,  setListings]  = useState([])
  const [bookings,  setBookings]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('listings')

  useEffect(() => { if (user) loadAll() }, [user])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadListings(), loadBookings()])
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

  const togglePause = async (listing) => {
    const newStatus = listing.status === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('properties').update({ status: newStatus }).eq('id', listing.id)
    if (error) { toast.error('Update failed'); return }
    toast.success(`Listing ${newStatus === 'active' ? 'activated' : 'paused'}`)
    loadListings()
  }

  const totalRevenue = bookings.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const activeCount  = listings.filter(l => l.status === 'active').length

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color: '#1A1210' }}>
              Landlord Dashboard
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#8A7E78' }}>Manage your properties</p>
          </div>
          <button onClick={loadAll}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(26,18,16,0.08)' }}>
            <RefreshCw size={16} style={{ color: '#5C4A3A' }} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Listings', value: listings.length,    icon: <Home size={24} className="text-terracotta" /> },
            { label: 'Active',         value: activeCount,         icon: <CheckCircle size={24} className="text-terracotta" /> },
            { label: 'Revenue',        value: `₦${(totalRevenue/1000).toFixed(0)}K`, icon: <Banknote size={24} className="text-terracotta" /> },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 text-center border"
              style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
              <div className="flex justify-center mb-1">{s.icon}</div>
              <p className="font-display font-black text-xl" style={{ color: '#C96A3A' }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8A7E78' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Add listing shortcuts */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { to: '/list',             label: 'For Sale',  icon: <Home size={24} className="text-terracotta" /> },
            { to: '/list-rental',      label: 'Rental',    icon: <Key size={24} className="text-terracotta" /> },
            { to: '/list-rental?type=hotel', label: 'Hotel', icon: <Hotel size={24} className="text-terracotta" /> },
          ].map(l => (
            <Link key={l.to} to={l.to}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-dashed transition-all"
              style={{ borderColor: 'rgba(201,106,58,0.3)', color: '#C96A3A', backgroundColor: 'rgba(201,106,58,0.03)' }}>
              <span>{l.icon}</span>
              <span className="text-xs font-semibold">+ {l.label}</span>
            </Link>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {[['listings','My Listings'],['bookings','Bookings']].map(([v,l]) => (
            <button key={v} onClick={() => setTab(v)}
              className="px-5 py-2.5 rounded-full text-sm font-semibold border transition-all"
              style={{
                backgroundColor: tab === v ? '#1A1210' : '#FFFFFF',
                color:           tab === v ? '#FFFFFF'  : '#5C4A3A',
                borderColor:     tab === v ? '#1A1210'  : '#E8DDD2',
              }}>
              {l}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-12" style={{ color: '#8A7E78' }}>Loading...</div>}

        {/* Listings tab */}
        {!loading && tab === 'listings' && (
          <div className="space-y-3">
            {listings.length === 0 ? (
              <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
                <div className="flex justify-center mb-3"><Home size={40} className="text-terracotta" /></div>
                <p className="font-semibold text-sm" style={{ color: '#1A1210' }}>No listings yet</p>
                <Link to="/list" className="btn-primary text-sm px-6 py-2.5 inline-flex mt-4">List Property →</Link>
              </div>
            ) : listings.map(l => {
              const s = STATUS_STYLES[l.status] || STATUS_STYLES.paused
              return (
                <div key={l.id} className="rounded-2xl border p-4"
                  style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: '#1A1210' }}>{l.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#8A7E78' }}>
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
                      style={{ borderColor: '#E8DDD2', color: '#5C4A3A', backgroundColor: '#FFFFFF' }}>
                      <Eye size={12} /> View
                    </Link>
                    {(l.status === 'active' || l.status === 'paused') && (
                      <button onClick={() => togglePause(l)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border flex-1 justify-center"
                        style={{ borderColor: '#E8DDD2', color: '#5C4A3A', backgroundColor: '#FFFFFF' }}>
                        <Pause size={12} /> {l.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                    )}
                    {(l.category === 'hotel' || l.category === 'shortlet' || l.category === 'rental') && (
                      <Link to="/availability"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
                        style={{ borderColor: '#C96A3A', color: '#C96A3A', backgroundColor: 'rgba(201,106,58,0.04)' }}>
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
              <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
                <div className="flex justify-center mb-3"><ClipboardList size={40} className="text-terracotta" /></div>
                <p className="font-semibold text-sm" style={{ color: '#1A1210' }}>No bookings yet</p>
              </div>
            ) : bookings.map(b => (
              <div key={b.id} className="rounded-2xl border p-4"
                style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#1A1210' }}>{b.guest_name}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8A7E78' }}>{b.properties?.title}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                    style={{
                      backgroundColor: b.status === 'confirmed' ? 'rgba(122,158,126,0.12)' : 'rgba(212,168,83,0.12)',
                      color:           b.status === 'confirmed' ? '#5C8060' : '#8A6A20',
                    }}>
                    {b.status}
                  </span>
                </div>
                <div className="text-xs" style={{ color: '#8A7E78' }}>
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
