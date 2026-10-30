import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Bath, Bed, CheckCircle, Heart, Home, Key, Lock, MapPin, MessageCircle, PartyPopper, Phone, Search, ShieldCheck, X } from 'lucide-react'
import { recordSwipe } from '@/lib/supabase'
import { fetchActivePlaces, fetchHostVerification, insertRentalEnquiry } from '@/data/rentalsRepository'
import { PLACE_TYPES, PLACE_TYPE_LABEL, isSaleListing, placeBadge, priceSuffix, emptyListPath } from '@/lib/placeTypes'
import { fetchPropertyContact } from '@/data/propertyDetailRepository'
import { useAuth } from '@/context/AuthContext'
import SwipeCard from '@/components/matching/SwipeCard'
import PropertyReserveModal from '@/components/ui/PropertyReserveModal'
import UnlockContactButton from '@/components/ui/UnlockContactButton'
import toast from 'react-hot-toast'

const formatPrice = (n) => n ? `₦${Number(n).toLocaleString()}` : '₦0'

const TYPES    = PLACE_TYPES
const SUBTYPES = ['All Types','Apartment','Self-Contain','Room & Parlour','Duplex','Bungalow','Studio']
const STATES   = ['All States','Lagos','Abuja','Rivers','Akwa Ibom','Delta','Oyo','Anambra','Enugu','Edo']

// ─── Interest Form Modal ───────────────────────────────────
// FIX (trace item 7-b): this modal used to save the enquiry and then open
// wa.me directly - the entire rest of the deal (agreeing terms, paying,
// moving in) happened off-platform over WhatsApp, with no escrow and no
// server-side payment enforcement whatsoever (violates item 3/6 of the
// fix request: a service must never be released - here, a landlord's
// contact and an agreed move-in - without a corresponding payment
// actually landing first). The enquiry save is harmless lead-capture and
// stays; what changes is what happens next: instead of an instant
// WhatsApp handoff, the tenant is routed into the SAME escrow-gated
// reserve flow PropertyPage.jsx already uses for sales (PropertyReserveModal
// -> start_property_escrow_payment -> Flutterwave -> webhook confirms
// `funded` -> get_property_contact() only then returns a real number).
// `properties` is the same table for sale/rental/shortlet rows, so this
// infrastructure applies here unchanged.
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
  const [showReserve, setShowReserve] = useState(false)
  const [contact, setContact] = useState(null)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const checkContact = async () => {
    const { data } = await fetchPropertyContact(rental.id)
    setContact(Array.isArray(data) ? data[0] || null : data || null)
  }

  useEffect(() => { checkContact() }, [rental.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!form.name || !form.phone) { toast.error('Name and phone are required'); return }
    setSending(true)

    // Save enquiry to Supabase - this is a lead signal only, it does NOT
    // reveal any contact details or move the deal forward on its own.
    try {
      await insertRentalEnquiry({
        property_id:  rental.id,
        user_id:      user?.id || null, // null for a true guest with no session -- attribution only when signed in
        tenant_name:  form.name,
        tenant_phone: form.phone,
        tenant_email: form.email,
        move_in_date: form.moveIn || null,
        duration:     form.duration,
        message:      form.message,
      })
    } catch {}

    setSending(false)
    setSent(true)
  }

  const handleContactClick = () => {
    if (!user) { toast.error('Sign in to continue'); return }
    if (contact?.phone) {
      const msg = encodeURIComponent(`Hi, I'm interested in *"${rental.title}"* on DealMatch - I've secured it through escrow. Let's arrange move-in.`)
      window.open('https://wa.me/' + contact.phone.replace(/\D/g, '') + '?text=' + msg, '_blank')
      return
    }
    setShowReserve(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor:'rgba(23,33,27,0.88)', backdropFilter:'blur(10px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{ backgroundColor:'#FFFAF5', maxHeight:'90vh' }}>

        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor:'#DEDDD6' }}>
          <div>
            <h3 className="font-display font-black text-lg" style={{ color:'#17211B' }}>Express Interest </h3>
            <p className="text-xs mt-0.5 truncate" style={{ color:'#647068' }}>{rental.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor:'rgba(23,33,27,0.08)' }}>
            <X size={14} style={{ color:'#5C4A3A' }} />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              {contact?.phone
                ? <CheckCircle size={48} className="text-green-600" />
                : <Lock size={40} style={{ color: '#C85F2D' }} />}
            </div>
            <h3 className="font-display font-black text-xl mb-2" style={{ color:'#17211B' }}>
              {contact?.phone ? 'Interest Recorded!' : 'One Step Left'}
            </h3>
            <p className="text-sm mb-6" style={{ color:'#647068' }}>
              {contact?.phone
                ? "You're already a party to a funded transaction on this listing - contact is unlocked."
                : 'The landlord\'s contact stays protected until your reservation is secured through DealMatch escrow - this keeps the deposit and move-in date safe for both sides, no off-platform payment required.'}
            </p>
            <div className="flex items-center gap-2 justify-center text-xs mb-6" style={{ color:'#7A9E7E' }}>
              <ShieldCheck size={14} /> Protected by DealMatch escrow
            </div>
            {contact?.phone ? (
              <button onClick={handleContactClick} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                <Phone size={14} /> Message the landlord
              </button>
            ) : (
              <div className="space-y-2">
                {/* Two paths, same destination (a real contact reveal via
                    get_property_contact): reserve through escrow to
                    actually secure the place, or spend a small credit
                    (item 2) just to ask the landlord a question first
                    without committing to anything yet. */}
                <button onClick={() => setShowReserve(true)} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                  <Lock size={14} /> Reserve & unlock contact
                </button>
                <div className="flex justify-center">
                  <UnlockContactButton targetType="property" targetId={rental.id} onUnlocked={() => checkContact()} />
                </div>
              </div>
            )}
            <button onClick={onClose} className="w-full py-3 mt-2 text-sm font-semibold" style={{ color:'#647068' }}>Not now</button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            {/* Property summary */}
            <div className="rounded-2xl p-3 flex gap-3" style={{ backgroundColor:'rgba(200,95,45,0.06)', border:'1px solid rgba(200,95,45,0.2)' }}>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color:'#17211B' }}>{rental.title}</p>
                <p className="text-xs" style={{ color:'#647068' }}>{rental.city}, {rental.state}</p>
              </div>
              <p className="font-black text-base" style={{ color:'#C85F2D' }}>{formatPrice(rental.price)}/yr</p>
            </div>

            {[
              { label:'Your Name *',  key:'name',  type:'text',  placeholder:'Full name' },
              { label:'Phone *',      key:'phone', type:'tel',   placeholder:'+234 800 000 0000' },
              { label:'Email',        key:'email', type:'email', placeholder:'Optional' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(23,33,27,0.5)' }}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(23,33,27,0.5)' }}>Move-in Date</label>
                <input type="date" value={form.moveIn} onChange={set('moveIn')} min={new Date().toISOString().split('T')[0]}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(23,33,27,0.5)' }}>Duration</label>
                <select value={form.duration} onChange={set('duration')} className="select text-sm"
                  style={{ backgroundColor:'#FFFFFF', color:'#17211B' }}>
                  {[1,3,6,12,24].map(n => <option key={n} value={n}>{n} month{n>1?'s':''}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(23,33,27,0.5)' }}>Message (optional)</label>
              <textarea value={form.message} onChange={set('message')} rows={3}
                placeholder="Tell the landlord about yourself..."
                className="input resize-none text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
            </div>

            <button onClick={handleSend} disabled={sending || !form.name || !form.phone}
              className="btn-primary w-full py-4"
              style={{ opacity: (!form.name || !form.phone) ? 0.5 : 1 }}>
              {sending ? 'Sending...' : 'Continue →'}
            </button>
          </div>
        )}
      </motion.div>

      {showReserve && (
        <PropertyReserveModal
          property={rental}
          onClose={() => setShowReserve(false)}
          onFunded={() => { setShowReserve(false); checkContact() }}
        />
      )}
    </div>
  )
}

// ─── Rental List Card ──────────────────────────────────────
function RentalCard({ rental, onInterest }) {
  const img = rental.images?.find(i => i?.is_primary)?.url || rental.images?.[0]?.url
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35 }}
      whileHover={{ y: -4 }}
      className="rounded-3xl overflow-hidden"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6', boxShadow: '0 4px 24px rgba(23,33,27,0.06)' }}
    >
      <div className="h-48 relative">
        {img
          ? <img src={img} alt={rental.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor:'rgba(200,95,45,0.08)' }}><Home size={24} className="text-terracotta" /></div>
        }
        {rental.hostVerified && (
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: '#C85F2D', color: '#FFFFFF' }}>
            Verified Host
          </div>
        )}
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: 'rgba(26,20,16,0.6)', color:'#FFFFFF', backdropFilter: 'blur(4px)' }}>
          {placeBadge(rental)}
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-display font-black text-base mb-1" style={{ color:'#17211B' }}>{rental.title}</h3>
        <div className="flex items-center gap-1 text-xs mb-3" style={{ color:'#647068' }}>
          <MapPin size={11} style={{ color:'#C85F2D' }} />
          <span>{rental.city}, {rental.state}</span>
        </div>
        <div className="flex items-center justify-between mb-4">
          <p className="font-black text-lg" style={{ color:'#C85F2D' }}>
            {formatPrice(rental.price)}
            <span className="text-xs font-normal" style={{ color:'#647068' }}>
              {priceSuffix(rental)}
            </span>
          </p>
          <div className="flex items-center gap-3 text-xs" style={{ color:'#647068' }}>
            {rental.property_type === 'land' && rental.size_sqm && <span>{Number(rental.size_sqm).toLocaleString()} sqm</span>}
            {rental.bedrooms  && <span className="flex items-center gap-0.5"><Bed size={10} /> {rental.bedrooms}bd</span>}
            {rental.bathrooms && <span className="flex items-center gap-0.5"><Bath size={10} /> {rental.bathrooms}ba</span>}
          </div>
        </div>
        {isSaleListing(rental) ? (
          <Link to={`/property/${rental.id}`}
            className="w-full py-3 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
            style={{ backgroundColor:'#C85F2D', color:'#FFFFFF' }}>
            View details
          </Link>
        ) : (
          <button onClick={() => onInterest(rental)}
            className="w-full py-3 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
            style={{ backgroundColor:'#C85F2D', color:'#FFFFFF' }}>
            <MessageCircle size={14} /> I'm Interested
          </button>
        )}
      </div>
    </motion.div>
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
  const [loadError, setLoadError] = useState(false)

  useEffect(() => { loadRentals() }, [type, stateF])

  const loadRentals = async () => {
    setLoading(true)
    setLoadError(false)
    let list = []
    try {
      // Do not wait forever on a weak connection: after 12 seconds show the retry message.
      const { data, error } = await Promise.race([
        fetchActivePlaces(type, stateF),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
      ])
      if (error) throw error
      list = data || []
    } catch {
      setLoadError(true)
      setRentals([])
      setSwipeQ([])
      setLoading(false)
      return
    }

    // Verified Host badge reflects the seller's real identity verification
    // status - never shown unless it's actually true.
    const sellerIds = [...new Set(list.map(r => r.seller_id).filter(Boolean))]
    if (sellerIds.length > 0) {
      const { data: sellers } = await fetchHostVerification(sellerIds)
      list = list.map(r => ({
        ...r,
        hostVerified: sellers?.find(s => s.id === r.seller_id)?.identity_verification_status === 'approved',
      }))
    }

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
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#EEE9DE' }}>
      <div className="max-w-6xl mx-auto px-4">

        <div className="flex items-center justify-between mb-5">
          <div>
            <motion.h1 initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.42, ease:[0.22,1,0.36,1] }} className="font-display text-2xl font-black" style={{ color:'#17211B' }}>Find Your Place, Without the Runaround.</motion.h1>
            <p className="text-xs mt-0.5" style={{ color:'#647068' }}>Rent, short-let, buy a home or find land. Real terms upfront, and no one's number until you pay.</p>
          </div>
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor:'#DEDDD6' }}>
            {[['grid','Grid'],['swipe','Swipe']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)}
                className="px-3 py-2 text-xs font-semibold transition-all"
                style={{ backgroundColor: viewMode === v ? '#17211B' : '#FFFFFF', color: viewMode === v ? '#FFFFFF' : '#647068' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color:'#647068' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, city..."
            className="input pl-11 text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
        </div>

        {/* Filters row 1 - type */}
        <div className="flex gap-2 overflow-x-auto mb-2 pb-1" style={{ scrollbarWidth:'none' }}>
          {TYPES.map(t => (
            <button key={t} onClick={() => setType(t)}
              className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
              style={{
                backgroundColor: type === t ? '#C85F2D' : '#FFFFFF',
                color:           type === t ? '#FFFFFF' : '#5C4A3A',
                borderColor:     type === t ? '#C85F2D' : '#DEDDD6',
              }}>{PLACE_TYPE_LABEL[t] || t}</button>
          ))}
          <Link to="/hotels"
            className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
            style={{ backgroundColor: '#FFFFFF', color: '#5C4A3A', borderColor: '#DEDDD6' }}>
            Hotels
          </Link>
          <Link to="/student-hostels"
            className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
            style={{ backgroundColor: '#FFFFFF', color: '#5C4A3A', borderColor: '#DEDDD6' }}>
            Student housing
          </Link>
        </div>

        {/* Filters row 2 - state */}
        <div className="flex gap-2 overflow-x-auto mb-5 pb-1" style={{ scrollbarWidth:'none' }}>
          {STATES.map(s => (
            <button key={s} onClick={() => setStateF(s)}
              className="px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
              style={{
                backgroundColor: stateF === s ? '#17211B' : '#FFFFFF',
                color:           stateF === s ? '#FFFFFF' : '#5C4A3A',
                borderColor:     stateF === s ? '#17211B' : '#DEDDD6',
              }}>{s}</button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color:'#647068' }}>
            <div className="flex justify-center mb-3"><Key size={40} className="text-terracotta animate-bounce" /></div>
            <p className="text-sm">Finding places...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor:'#FFFAF5', borderColor:'#DEDDD6' }}>
            <p className="font-semibold text-sm mb-1" style={{ color:'#17211B' }}>We could not load places right now.</p>
            <p className="text-xs mb-4" style={{ color:'#647068' }}>Check your connection and try again.</p>
            <button onClick={loadRentals} className="btn-primary inline-flex px-6 py-2.5 text-sm">Try again</button>
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
                          : <div className="rounded-3xl w-full h-full opacity-50" style={{ backgroundColor:'#FFFAF5', border:'1px solid #DEDDD6' }} />
                        }
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-3xl p-10 text-center" style={{ backgroundColor:'#FFFAF5' }}>
                  <div className="flex justify-center mb-4"><PartyPopper size={48} className="text-gold" /></div>
                  <h3 className="font-display font-black text-xl mb-2" style={{ color:'#17211B' }}>You've seen everything!</h3>
                  <p className="text-xs mb-4" style={{ color:'#647068' }}>Got a place of your own to rent out? List it and reach verified seekers.</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button onClick={loadRentals} className="btn-primary px-8 py-3 text-sm">Refresh</button>
                    <Link to={emptyListPath(type)} className="text-sm font-bold px-8 py-3 rounded-full border" style={{ borderColor:'#C85F2D', color:'#C85F2D' }}>List a place</Link>
                  </div>
                </div>
              )
            )}

            {/* ── Grid mode ── */}
            {viewMode === 'grid' && (
              filtered.length === 0 ? (
                <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor:'#FFFAF5', borderColor:'#DEDDD6' }}>
                  <div className="flex justify-center mb-3"><Home size={40} className="text-terracotta" /></div>
                  <p className="font-semibold text-sm mb-1" style={{ color:'#17211B' }}>No places found</p>
                  <p className="text-xs mb-4" style={{ color:'#647068' }}>Nothing matches yet. Be the first to list here.</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link to={emptyListPath(type)} className="btn-primary inline-flex px-6 py-2.5 text-sm">{type === 'Buy' || type === 'Land' ? 'List a property for sale' : 'List a place'}</Link>
                    {type === 'All' && <Link to="/list" className="text-sm font-bold px-6 py-2.5 rounded-full border" style={{ borderColor:'#C85F2D', color:'#C85F2D' }}>List a home or land for sale</Link>}
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
