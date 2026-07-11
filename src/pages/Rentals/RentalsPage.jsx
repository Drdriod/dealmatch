import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bath, Bed, CheckCircle, Heart, Home, Key, MapPin, MessageCircle, PartyPopper, Phone, Search, X } from 'lucide-react'
import { recordSwipe, supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import SwipeCard from '@/components/matching/SwipeCard'
import toast from 'react-hot-toast'

const formatPrice = (n) => n ? `₦${Number(n).toLocaleString()}` : '₦0'
const WHATSAPP = '2347057392060'

const TYPES    = ['All','Rental','Short-let']
const SUBTYPES = ['All Types','Apartment','Self-Contain','Room & Parlour','Duplex','Bungalow','Studio']
const STATES   = ['All States','Lagos','Abuja','Rivers','Akwa Ibom','Delta','Oyo','Anambra','Enugu','Edo']

// ─── Interest Form Modal ───────────────────────────────────
function InterestModal({ rental, onClose }) {
  const { profile, user } = useAuth()
  const [form, setForm] = useState({
    name:    profile?.full_name || '',
    phone:   profile?.phone     || '',
    email:   user?.email        || '',
    message: '',
    moveIn:  '',
    duration: '12',
  })
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSend = async () => {
    if (!form.name || !form.phone) { toast.error('Name and phone are required'); return }
    setSending(true)

    // Save enquiry to Supabase
    try {
      await supabase.from('rental_enquiries').insert({
        property_id:  rental.id,
        tenant_name:  form.name,
        tenant_phone: form.phone,
        tenant_email: form.email,
        move_in_date: form.moveIn || null,
        duration:     form.duration,
        message:      form.message,
      })
    } catch {}

    // Notify landlord/DealMatch via WhatsApp
    const msg = encodeURIComponent(
      `*Rental Enquiry: DealMatch*\n\n` +
      `Property: ${rental.title}\n` +
      `${rental.city}, ${rental.state}\n` +
      `Price: ₦${Number(rental.price).toLocaleString()}/yr\n\n` +
      `Interested Tenant:\n` +
      `Name: ${form.name}\n` +
      `Phone: ${form.phone}\n` +
      (form.email   ? `Email: ${form.email}\n`     : '') +
      (form.moveIn  ? `Move-in: ${form.moveIn}\n`  : '') +
      `Duration: ${form.duration} month${Number(form.duration) > 1 ? 's' : ''}\n` +
      (form.message ? `\nMessage: ${form.message}` : '')
    )
    window.open('https://wa.me/' + WHATSAPP + '?text=' + msg, '_blank')
    setSending(false)
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor:'rgba(26,18,16,0.88)', backdropFilter:'blur(10px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{ backgroundColor:'#FFFAF5', maxHeight:'90vh' }}>

        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor:'#E8DDD2' }}>
          <div>
            <h3 className="font-display font-black text-lg" style={{ color:'#1A1210' }}>Express Interest </h3>
            <p className="text-xs mt-0.5 truncate" style={{ color:'#8A7E78' }}>{rental.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor:'rgba(26,18,16,0.08)' }}>
            <X size={14} style={{ color:'#5C4A3A' }} />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4"><CheckCircle size={48} className="text-green-600" /></div>
            <h3 className="font-display font-black text-xl mb-2" style={{ color:'#1A1210' }}>Interest Sent!</h3>
            <p className="text-sm mb-6" style={{ color:'#8A7E78' }}>
              The landlord has been notified via WhatsApp. They'll contact you at <strong>{form.phone}</strong> shortly.
            </p>
            <button onClick={onClose} className="btn-primary w-full py-3">Done</button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            {/* Property summary */}
            <div className="rounded-2xl p-3 flex gap-3" style={{ backgroundColor:'rgba(201,106,58,0.06)', border:'1px solid rgba(201,106,58,0.2)' }}>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color:'#1A1210' }}>{rental.title}</p>
                <p className="text-xs" style={{ color:'#8A7E78' }}>{rental.city}, {rental.state}</p>
              </div>
              <p className="font-black text-base" style={{ color:'#C96A3A' }}>{formatPrice(rental.price)}/yr</p>
            </div>

            {[
              { label:'Your Name *',  key:'name',  type:'text',  placeholder:'Full name' },
              { label:'Phone *',      key:'phone', type:'tel',   placeholder:'+234 800 000 0000' },
              { label:'Email',        key:'email', type:'email', placeholder:'Optional' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>Move-in Date</label>
                <input type="date" value={form.moveIn} onChange={set('moveIn')} min={new Date().toISOString().split('T')[0]}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>Duration</label>
                <select value={form.duration} onChange={set('duration')} className="select text-sm"
                  style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }}>
                  {[1,3,6,12,24].map(n => <option key={n} value={n}>{n} month{n>1?'s':''}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>Message (optional)</label>
              <textarea value={form.message} onChange={set('message')} rows={3}
                placeholder="Tell the landlord about yourself..."
                className="input resize-none text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
            </div>

            <button onClick={handleSend} disabled={sending || !form.name || !form.phone}
              className="btn-primary w-full py-4"
              style={{ opacity: (!form.name || !form.phone) ? 0.5 : 1 }}>
              {sending ? 'Sending...' : 'Send Interest via WhatsApp →'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ─── Rental List Card ──────────────────────────────────────
function RentalCard({ rental, onInterest }) {
  const img = rental.images?.find(i => i?.is_primary)?.url || rental.images?.[0]?.url
  return (
    <div className="rounded-2xl overflow-hidden border" style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
      <div className="h-44 relative">
        {img
          ? <img src={img} alt={rental.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ backgroundColor:'rgba(201,106,58,0.08)' }}><Home size={24} className="text-terracotta" /></div>
        }
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: rental.category === 'shortlet' ? '#C96A3A' : '#1A1210', color:'#FFFFFF' }}>
          {rental.category === 'shortlet' ? 'Short-let' : 'Rental'}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-display font-black text-base mb-0.5" style={{ color:'#1A1210' }}>{rental.title}</h3>
        <div className="flex items-center gap-1 text-xs mb-2" style={{ color:'#8A7E78' }}>
          <MapPin size={11} style={{ color:'#C96A3A' }} />
          <span>{rental.city}, {rental.state}</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <p className="font-black text-base" style={{ color:'#C96A3A' }}>
            {formatPrice(rental.price)}
            <span className="text-xs font-normal" style={{ color:'#8A7E78' }}>
              {rental.category === 'shortlet' ? '/night' : '/yr'}
            </span>
          </p>
          <div className="flex items-center gap-3 text-xs" style={{ color:'#8A7E78' }}>
            {rental.bedrooms  && <span className="flex items-center gap-0.5"><Bed size={10} /> {rental.bedrooms}bd</span>}
            {rental.bathrooms && <span className="flex items-center gap-0.5"><Bath size={10} /> {rental.bathrooms}ba</span>}
          </div>
        </div>
        <button onClick={() => onInterest(rental)}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          style={{ backgroundColor:'#C96A3A', color:'#FFFFFF' }}>
          <MessageCircle size={14} /> I'm Interested
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function RentalsPage() {
  const { user }    = useAuth()
  const [rentals,   setRentals]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [type,      setType]      = useState('All')
  const [subtype,   setSubtype]   = useState('All Types')
  const [stateF,    setStateF]    = useState('All States')
  const [viewMode,  setViewMode]  = useState('grid')
  const [interest,  setInterest]  = useState(null)
  const [swipeQ,    setSwipeQ]    = useState([])

  useEffect(() => { loadRentals() }, [type, stateF])

  const loadRentals = async () => {
    setLoading(true)
    let q = supabase.from('properties').select('*')
      .in('category', ['rental','shortlet'])
      .eq('status','active')
      .or('occupancy_status.is.null,occupancy_status.eq.vacant') // hide units marked occupied offline - prevents double booking; NULL = legacy listings, treated as vacant
      .order('created_at',{ ascending:false }).limit(40)
    if (type === 'Rental')   q = q.eq('category', 'rental')
    if (type === 'Short-let') q = q.eq('category', 'shortlet')
    if (stateF !== 'All States') q = q.eq('state', stateF)
    const { data } = await q
    const list = data || []
    setRentals(list)
    setSwipeQ([...list])
    setLoading(false)
  }

  const filtered = rentals.filter(r => {
    const ms = !search || r.title?.toLowerCase().includes(search.toLowerCase()) || r.city?.toLowerCase().includes(search.toLowerCase())
    const mt = subtype === 'All Types' || r.property_type === subtype.toLowerCase().replace(' & ', '_')
    return ms && mt
  })

  const handleSwipe = useCallback((action, property) => {
    setSwipeQ(q => q.filter(p => p.id !== property.id))
    if (action === 'like') {
      if (user) recordSwipe({ userId: user.id, propertyId: property.id, action:'like' })
      toast.success('Added to matches!')
    }
  }, [user])

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color:'#1A1210' }}>Rentals & Short-lets </h1>
            <p className="text-xs mt-0.5" style={{ color:'#8A7E78' }}>Find your next home</p>
          </div>
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor:'#E8DDD2' }}>
            {[['grid','Grid'],['swipe','Swipe']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)}
                className="px-3 py-2 text-xs font-semibold transition-all"
                style={{ backgroundColor: viewMode === v ? '#1A1210' : '#FFFFFF', color: viewMode === v ? '#FFFFFF' : '#8A7E78' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color:'#8A7E78' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, city..."
            className="input pl-11 text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
        </div>

        {/* Filters row 1 - type */}
        <div className="flex gap-2 overflow-x-auto mb-2 pb-1" style={{ scrollbarWidth:'none' }}>
          {TYPES.map(t => (
            <button key={t} onClick={() => setType(t)}
              className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
              style={{
                backgroundColor: type === t ? '#C96A3A' : '#FFFFFF',
                color:           type === t ? '#FFFFFF' : '#5C4A3A',
                borderColor:     type === t ? '#C96A3A' : '#E8DDD2',
              }}>{t}</button>
          ))}
        </div>

        {/* Filters row 2 - state */}
        <div className="flex gap-2 overflow-x-auto mb-5 pb-1" style={{ scrollbarWidth:'none' }}>
          {STATES.map(s => (
            <button key={s} onClick={() => setStateF(s)}
              className="px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
              style={{
                backgroundColor: stateF === s ? '#1A1210' : '#FFFFFF',
                color:           stateF === s ? '#FFFFFF' : '#5C4A3A',
                borderColor:     stateF === s ? '#1A1210' : '#E8DDD2',
              }}>{s}</button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color:'#8A7E78' }}>
            <div className="flex justify-center mb-3"><Key size={40} className="text-terracotta animate-bounce" /></div>
            <p className="text-sm">Finding rentals...</p>
          </div>
        ) : (
          <>
            {/* ── Swipe mode ── */}
            {viewMode === 'swipe' && (
              swipeQ.length > 0 ? (
                <div className="relative" style={{ height:540 }}>
                  {[...swipeQ].reverse().slice(0, 3).map((r, i, arr) => {
                    const isTop = i === arr.length - 1
                    const offset = arr.length - 1 - i
                    return (
                      <div key={r.id} style={{ position:'absolute', inset:0, transform:`scale(${1 - offset * 0.04}) translateY(${offset * -10}px)`, transformOrigin:'bottom center', zIndex:i, pointerEvents: isTop ? 'auto' : 'none' }}>
                        {isTop
                          ? <SwipeCard property={r} matchScore={null} matchReasons={[]} onSwipe={handleSwipe} />
                          : <div className="rounded-3xl w-full h-full opacity-50" style={{ backgroundColor:'#FFFAF5', border:'1px solid #E8DDD2' }} />
                        }
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-3xl p-10 text-center" style={{ backgroundColor:'#FFFAF5' }}>
                  <div className="flex justify-center mb-4"><PartyPopper size={48} className="text-gold" /></div>
                  <h3 className="font-display font-black text-xl mb-2" style={{ color:'#1A1210' }}>You've seen everything!</h3>
                  <button onClick={loadRentals} className="btn-primary px-8 py-3 text-sm mt-4">Refresh</button>
                </div>
              )
            )}

            {/* ── Grid mode ── */}
            {viewMode === 'grid' && (
              filtered.length === 0 ? (
                <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
                  <div className="flex justify-center mb-3"><Home size={40} className="text-terracotta" /></div>
                  <p className="font-semibold text-sm" style={{ color:'#1A1210' }}>No rentals found</p>
                </div>
              ) : (
                <div className="grid gap-5">
                  {filtered.map(r => <RentalCard key={r.id} rental={r} onInterest={setInterest} />)}
                </div>
              )
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {interest && <InterestModal rental={interest} onClose={() => setInterest(null)} />}
      </AnimatePresence>
    </div>
  )
}
