import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Check, Hotel, MapPin, PartyPopper, Search, Star, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const WHATSAPP = '2347057392060'
const formatPrice = (n) => n ? `₦${Number(n).toLocaleString()}` : 'Contact'
const HOTEL_TYPES = ['All', 'Luxury', 'Budget', 'Resort', 'Short-let', 'Boutique']
const STATES = ['All States','Lagos','Abuja','Rivers','Akwa Ibom','Delta','Oyo','Kano','Cross River','Edo']

// ─── Full Booking Modal ────────────────────────────────────
function BookingModal({ hotel, onClose }) {
  const { user, profile } = useAuth()
  const [form, setForm] = useState({
    checkin:     '',
    checkout:    '',
    guests:      1,
    rooms:       1,
    room_type:   '',
    guest_name:  profile?.full_name || '',
    guest_phone: profile?.phone     || '',
    guest_email: user?.email        || '',
    special:     '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [booked,     setBooked]     = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setN = k => e => setForm(f => ({ ...f, [k]: Number(e.target.value) }))

  // Price calculator
  const pricePerNight = hotel.room_categories?.find(c => c.name === form.room_type)?.price_per_night
    || hotel.room_categories?.[0]?.price_per_night
    || null

  const nights = form.checkin && form.checkout
    ? Math.max(0, Math.round((new Date(form.checkout) - new Date(form.checkin)) / 86400000))
    : 0
  const subtotal   = pricePerNight ? pricePerNight * form.rooms * nights : null
  const platform_fee = subtotal ? Math.round(subtotal * 0.12) : null
  const totalDue   = subtotal ? subtotal + platform_fee : null

  const handleBook = async () => {
    if (!form.checkin || !form.checkout || !form.guest_name || !form.guest_phone) {
      toast.error('Please fill all required fields'); return
    }
    if (nights <= 0) { toast.error('Check-out must be after check-in'); return }

    // ── Clash-prevention: check room availability for date range ──
    const selectedCategory = hotel.room_categories?.find(c => c.name === form.room_type)
    const { data: availCheck, error: availErr } = await supabase.rpc('check_booking_availability', {
      p_property_id: hotel.id,
      p_checkin:     form.checkin,
      p_checkout:    form.checkout,
      p_rooms:       form.rooms,
      p_category_id: selectedCategory?.id || null,
    })
    if (availErr) {
      // Function may not exist yet - fallback: count existing confirmed bookings manually
      const { data: clashData } = await supabase
        .from('bookings')
        .select('rooms_booked')
        .eq('property_id', hotel.id)
        .not('status', 'in', '(cancelled,no_show)')
        .lt('checkin_date', form.checkout)
        .gt('checkout_date', form.checkin)
      const bookedRooms = (clashData || []).reduce((sum, b) => sum + (b.rooms_booked || 1), 0)
      const totalAvail  = hotel.room_categories?.reduce((s, c) => s + (c.available_rooms || 0), 0) || 0
      if (bookedRooms + form.rooms > totalAvail) {
        toast.error(`Sorry! Only ${Math.max(0, totalAvail - bookedRooms)} room(s) available for those dates.`)
        return
      }
    } else if (availCheck === false) {
      toast.error('Sorry! No rooms available for the selected dates. Please choose different dates.')
      return
    }

    setSubmitting(true)

    try {
      await supabase.from('bookings').insert({
        property_id:   hotel.id,
        guest_name:    form.guest_name,
        guest_phone:   form.guest_phone,
        guest_email:   form.guest_email,
        checkin_date:  form.checkin,
        checkout_date: form.checkout,
        rooms_booked:  form.rooms,
        total_amount:  totalDue,
        source:        'dealmatch',
        status:        'confirmed',
        notes:         form.special,
      })

      // Notify hotel owner via WhatsApp
      const msg = encodeURIComponent(
        `*New Booking: DealMatch*\n\n` +
        `Hotel: ${hotel.title}\n` +
        `Guest: ${form.guest_name} | ${form.guest_phone}\n` +
        `Check-in: ${form.checkin}\nCheck-out: ${form.checkout}\n` +
        `Rooms: ${form.rooms} × ${form.room_type || 'Standard'}\nGuests: ${form.guests}\n` +
        (totalDue ? `Total: ₦${totalDue.toLocaleString()}\n` : '') +
        (form.special ? `Special requests: ${form.special}\n` : '') +
        `\nBooked via DealMatch`
      )
      window.open('https://wa.me/' + WHATSAPP + '?text=' + msg, '_blank')
      setBooked(true)
    } catch (err) {
      toast.error('Booking failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor:'rgba(26,18,16,0.88)', backdropFilter:'blur(10px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{ backgroundColor:'#FFFAF5', maxHeight:'92vh' }}>

        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor:'#E8DDD2' }}>
          <div>
            <h3 className="font-display font-black text-lg" style={{ color:'#1A1210' }}>Book: {hotel.title}</h3>
            <p className="text-xs mt-0.5" style={{ color:'#8A7E78' }}>{hotel.city}, {hotel.state}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor:'rgba(26,18,16,0.08)' }}>
            <X size={14} style={{ color:'#5C4A3A' }} />
          </button>
        </div>

        {booked ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4"><PartyPopper size={48} className="text-gold" /></div>
            <h3 className="font-display font-black text-xl mb-2" style={{ color:'#1A1210' }}>Booking Confirmed!</h3>
            <p className="text-sm mb-2" style={{ color:'#8A7E78' }}>
              {hotel.title} has been notified. They'll contact you at <strong>{form.guest_phone}</strong> to confirm.
            </p>
            {totalDue && (
              <p className="text-base font-black mb-6" style={{ color:'#C96A3A' }}>
                Total: ₦{totalDue.toLocaleString()}
              </p>
            )}
            <button onClick={onClose} className="btn-primary w-full py-3">Done</button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            {/* Room type */}
            {hotel.room_categories?.length > 0 && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(26,18,16,0.5)' }}>Room Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {hotel.room_categories.map(c => (
                    <button key={c.id} type="button" onClick={() => setForm(f => ({ ...f, room_type: c.name }))}
                      className="p-3 rounded-2xl border-2 text-left transition-all"
                      style={{
                        borderColor:     form.room_type === c.name ? '#C96A3A' : '#E8DDD2',
                        backgroundColor: form.room_type === c.name ? 'rgba(201,106,58,0.05)' : '#FFFFFF',
                      }}>
                      <p className="font-semibold text-sm" style={{ color:'#1A1210' }}>{c.name}</p>
                      {c.price_per_night && (
                        <p className="text-xs mt-0.5" style={{ color:'#C96A3A' }}>₦{Number(c.price_per_night).toLocaleString()}/night</p>
                      )}
                      <p className="text-[10px] mt-0.5" style={{ color: c.available_rooms > 0 ? '#7A9E7E' : '#C96A3A' }}>
                        {c.available_rooms > 0 ? `${c.available_rooms} available` : 'Fully booked'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>Check-in *</label>
                <input type="date" value={form.checkin} onChange={set('checkin')} min={new Date().toISOString().split('T')[0]}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>Check-out *</label>
                <input type="date" value={form.checkout} onChange={set('checkout')} min={form.checkin || new Date().toISOString().split('T')[0]}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
              </div>
            </div>

            {/* Guests + rooms */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>Guests</label>
                <select value={form.guests} onChange={setN('guests')} className="select text-sm"
                  style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }}>
                  {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} guest{n>1?'s':''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>Rooms</label>
                <select value={form.rooms} onChange={setN('rooms')} className="select text-sm"
                  style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }}>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} room{n>1?'s':''}</option>)}
                </select>
              </div>
            </div>

            {/* Guest details */}
            {[
              { label:'Full Name *',  key:'guest_name',  type:'text',  placeholder:'Your full name' },
              { label:'Phone *',      key:'guest_phone', type:'tel',   placeholder:'+234 800 000 0000' },
              { label:'Email',        key:'guest_email', type:'email', placeholder:'email@example.com' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
              </div>
            ))}

            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(26,18,16,0.5)' }}>Special Requests</label>
              <textarea value={form.special} onChange={set('special')} rows={2} placeholder="Any special requests or notes..."
                className="input resize-none text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
            </div>

            {/* Price calculator */}
            {nights > 0 && pricePerNight && (
              <div className="rounded-2xl p-4" style={{ backgroundColor:'rgba(201,106,58,0.06)', border:'1px solid rgba(201,106,58,0.2)' }}>
                <p className="text-xs font-bold mb-2" style={{ color:'#C96A3A' }}>Price Breakdown</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color:'#8A7E78' }}>₦{Number(pricePerNight).toLocaleString()} × {form.rooms} room{form.rooms>1?'s':''} × {nights} night{nights>1?'s':''}</span>
                    <strong style={{ color:'#1A1210' }}>₦{subtotal?.toLocaleString()}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color:'#8A7E78' }}>Platform fee (8%)</span>
                    <strong style={{ color:'#C96A3A' }}>₦{platform_fee?.toLocaleString()}</strong>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 font-black" style={{ borderColor:'rgba(201,106,58,0.2)', fontSize:'1rem' }}>
                    <span style={{ color:'#1A1210' }}>Total</span>
                    <span style={{ color:'#C96A3A' }}>₦{totalDue?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            <button onClick={handleBook} disabled={submitting || !form.checkin || !form.checkout || !form.guest_name || !form.guest_phone}
              className="btn-primary w-full py-4"
              style={{ opacity: (!form.checkin || !form.checkout || !form.guest_name || !form.guest_phone) ? 0.5 : 1 }}>
              {submitting ? 'Confirming...' : `Confirm Booking${totalDue ? ` : ₦${totalDue.toLocaleString()}` : ''} →`}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ─── Hotel Card ────────────────────────────────────────────
function HotelCard({ hotel, onBook }) {
  const img       = hotel.images?.find(i => i?.is_primary)?.url || hotel.images?.[0]?.url
  const available = hotel.room_categories?.some(c => c.available_rooms > 0)
  const minPrice  = hotel.room_categories?.map(c => c.price_per_night).filter(Boolean).reduce((a, b) => Math.min(a, b), Infinity)

  return (
    <div className="rounded-2xl overflow-hidden border"
      style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2', boxShadow:'0 2px 12px rgba(26,18,16,0.05)' }}>
      <div className="relative h-48">
        {img
          ? <img src={img} alt={hotel.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ backgroundColor:'rgba(201,106,58,0.08)' }}></div>
        }
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: hotel.category === 'hotel' ? '#1A1210' : '#C96A3A', color:'#FFFFFF' }}>
          {hotel.category === 'hotel' ? 'Hotel' : 'Short-let'}
        </div>
        {!available && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={{ backgroundColor:'rgba(201,106,58,0.9)', color:'#FFFFFF' }}>Fully Booked</div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display font-black text-base mb-1" style={{ color:'#1A1210' }}>{hotel.title}</h3>
        <div className="flex items-center gap-1 text-xs mb-2" style={{ color:'#8A7E78' }}>
          <MapPin size={11} style={{ color:'#C96A3A' }} />
          <span>{hotel.city}, {hotel.state}</span>
        </div>
        {hotel.features?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {hotel.features.slice(0, 3).map(f => (
              <span key={f} className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ backgroundColor:'rgba(26,18,16,0.06)', color:'#5C4A3A' }}>{f}</span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <div>
            {minPrice && minPrice < Infinity ? (
              <p className="font-black text-base" style={{ color:'#C96A3A' }}>
                ₦{Number(minPrice).toLocaleString()}<span className="text-xs font-normal" style={{ color:'#8A7E78' }}>/night</span>
              </p>
            ) : (
              <p className="text-xs" style={{ color:'#8A7E78' }}>Contact for price</p>
            )}
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: available ? 'rgba(122,158,126,0.1)' : 'rgba(201,106,58,0.1)', color: available ? '#5C8060' : '#C96A3A' }}>
            {available ? 'Available' : 'Fully Booked'}
          </span>
        </div>
        <div className="flex gap-2">
          <Link to={`/property/${hotel.id}`}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold border text-center transition-all"
            style={{ borderColor:'#E8DDD2', color:'#5C4A3A', backgroundColor:'#FFFFFF' }}>
            View Details
          </Link>
          <button onClick={() => onBook(hotel)} disabled={!available}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ backgroundColor: available ? '#C96A3A' : 'rgba(26,18,16,0.06)', color: available ? '#FFFFFF' : '#8A7E78' }}>
            {available ? 'Book Now' : 'Fully Booked'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function HotelsPage() {
  const [hotels,  setHotels]  = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [state,   setState]   = useState('All States')
  const [typeFilter, setTypeFilter] = useState('All')
  const [bookingHotel, setBookingHotel] = useState(null)

  useEffect(() => { loadHotels() }, [state])

  const loadHotels = async () => {
    setLoading(true)
    let q = supabase
      .from('properties')
      .select('*, room_categories(id, name, price_per_night, available_rooms)')
      .in('category', ['hotel', 'shortlet'])
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(30)
    if (state !== 'All States') q = q.eq('state', state)
    const { data } = await q
    setHotels(data || [])
    setLoading(false)
  }

  const filtered = hotels.filter(h => {
    const ms = !search || h.title?.toLowerCase().includes(search.toLowerCase()) || h.city?.toLowerCase().includes(search.toLowerCase())
    const mt = typeFilter === 'All' || (typeFilter === 'Short-let' && h.category === 'shortlet') || (typeFilter !== 'Short-let' && h.category === 'hotel')
    return ms && mt
  })

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        <div className="mb-6">
          <h1 className="font-display text-2xl font-black" style={{ color:'#1A1210' }}>Stay Somewhere Real.</h1>
          <p className="text-xs mt-0.5" style={{ color:'#8A7E78' }}>Short stays with honest photos and hosts who confirm before you pay.</p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color:'#8A7E78' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search hotels, cities..."
            className="input pl-11 text-sm" style={{ backgroundColor:'#FFFFFF', color:'#1A1210' }} />
        </div>

        {/* State filter */}
        <div className="flex gap-2 overflow-x-auto mb-3 pb-1" style={{ scrollbarWidth:'none' }}>
          {STATES.map(s => (
            <button key={s} onClick={() => setState(s)}
              className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
              style={{
                backgroundColor: state === s ? '#1A1210' : '#FFFFFF',
                color:           state === s ? '#FFFFFF' : '#5C4A3A',
                borderColor:     state === s ? '#1A1210' : '#E8DDD2',
              }}>{s}</button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex gap-2 overflow-x-auto mb-6 pb-1" style={{ scrollbarWidth:'none' }}>
          {HOTEL_TYPES.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
              style={{
                backgroundColor: typeFilter === t ? '#C96A3A' : '#FFFFFF',
                color:           typeFilter === t ? '#FFFFFF' : '#5C4A3A',
                borderColor:     typeFilter === t ? '#C96A3A' : '#E8DDD2',
              }}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color:'#8A7E78' }}>
            <div className="flex justify-center mb-3"><Hotel size={40} className="text-terracotta animate-bounce" /></div>
            <p className="text-sm">Loading hotels...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
            <div className="flex justify-center mb-3"><Hotel size={40} className="text-terracotta" /></div>
            <p className="font-semibold text-sm" style={{ color:'#1A1210' }}>No hotels found</p>
            <p className="text-xs mt-1" style={{ color:'#8A7E78' }}>Try a different location or type.</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {filtered.map(hotel => (
              <HotelCard key={hotel.id} hotel={hotel} onBook={setBookingHotel} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {bookingHotel && <BookingModal hotel={bookingHotel} onClose={() => setBookingHotel(null)} />}
      </AnimatePresence>
    </div>
  )
}
