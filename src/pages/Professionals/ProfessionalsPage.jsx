import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import { Award, Briefcase, Building2, CheckCircle, ChevronLeft, ChevronRight, Clock, Filter, HardHat, Heart, MapPin, MessageCircle, PartyPopper, Phone, Search, Shield, Star, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { analytics } from '@/lib/posthog'
import { clientRateLimit } from '@/lib/security'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────
const PRO_TYPES = [
  { id:'all',         label:'All',        icon:'users' },
  { id:'agent',       label:'Agents',     icon: <Building2 size={20} className="text-terracotta" /> },
  { id:'surveyor',    label:'Surveyors',  icon:'ruler' },
  { id:'inspector',   label:'Inspectors', icon:'search' },
  { id:'valuer',      label:'Valuers',    emoji:'bar-chart' },
  { id:'lawyer',      label:'Lawyers',    icon:'scale' },
  { id:'lender',      label:'Lenders',    emoji:'landmark' },
  { id:'architect',   label:'Architects', icon: <HardHat size={20} className="text-terracotta" /> },
  { id:'contractor',  label:'Contractors',icon:'hammer' },
]

// ─── Star Rating Display ──────────────────────────────────
function StarRating({ rating, count, size = 'sm' }) {
  const s = size === 'sm' ? 11 : 14
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1,2,3,4,5].map(i => (
          <svg key={i} width={s} height={s} viewBox="0 0 12 12" fill={i <= Math.round(rating) ? '#D4A853' : 'none'}
            stroke={i <= Math.round(rating) ? '#D4A853' : '#DEDDD6'} strokeWidth="1">
            <polygon points="6,1 7.8,4.5 11.5,5 9,7.5 9.6,11 6,9 2.4,11 3,7.5 0.5,5 4.2,4.5"/>
          </svg>
        ))}
      </div>
      <span className={`font-bold ${size === 'sm' ? 'text-xs' : 'text-sm'}`} style={{ color: '#17211B' }}>{rating.toFixed(1)}</span>
      {count && <span className={`${size === 'sm' ? 'text-[10px]' : 'text-xs'}`} style={{ color: '#647068' }}>({count})</span>}
    </div>
  )
}

// ─── Contact Request Modal ────────────────────────────────
function ContactModal({ pro, onClose }) {
  const { user, profile } = useAuth()
  const [form, setForm]   = useState({ name: profile?.full_name || '', phone: profile?.phone || '', details: '', urgency: 'normal' })
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSend = async () => {
    const rl = clientRateLimit('contact_pro', 5, 60_000)
    if (!rl.allowed) { toast.error(rl.message); return }
    if (!form.name || !form.phone) { toast.error('Your name and phone are required'); return }

    setSending(true)
    try {
      const { error } = await supabase.from('professional_requests').insert({
        user_id:           user?.id || null,
        professional_id:   pro.id,
        professional_type: pro.type,
        professional_name: pro.full_name,
        client_name:       form.name,
        client_phone:      form.phone,
        details:           form.details,
        urgency:           form.urgency,
        status:            'pending',
      })

      if (error) throw error

      analytics.professionalContacted(pro.type, pro.id)
      setSent(true)
    } catch (err) {
      console.error('Professional request error:', err)
      if (err.code === '42P01') {
        toast.error('System error: Table "professional_requests" is missing. Please contact support.')
      } else if (err.code === '42501') {
        toast.error('Permission denied. Please ensure you are logged in.')
      } else {
        toast.error('Could not send request. Try again.')
      }
    } finally {
      setSending(false)
    }
  }

  const EMOJI = { agent:'users', surveyor:'ruler', inspector:'search', valuer:'bar-chart-2', lawyer:'scale', lender:'landmark', architect:'hard-hat', contractor:'hammer' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(23,33,27,0.88)', backdropFilter: 'blur(10px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:40 }}
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ backgroundColor:'#FFFAF5', maxHeight:'90vh', overflowY:'auto' }}>

        {sent ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4"><CheckCircle size={48} className="text-green-600" /></div>
            <h3 className="font-display font-black text-xl mb-2" style={{ color:'#17211B' }}>Request Sent!</h3>
            <p className="text-sm mb-2" style={{ color:'#647068' }}>
              <strong style={{ color:'#17211B' }}>{pro.full_name}</strong> has received your request and will contact you within 2 hours.
            </p>
            <p className="text-xs mb-6" style={{ color:'#647068' }}>You'll get a notification when they respond.</p>
            <button onClick={onClose} className="btn-primary w-full py-3 text-sm">Done</button>
          </div>
        ) : (
          <>
            <div className="p-5 border-b flex items-center gap-3" style={{ borderColor:'#DEDDD6' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ backgroundColor:'rgba(200,95,45,0.08)' }}>
                {EMOJI[pro.type] || 'user'}
              </div>
              <div className="flex-1">
                <h3 className="font-display font-black text-base" style={{ color:'#17211B' }}>Request {pro.full_name}</h3>
                <p className="text-xs capitalize" style={{ color:'#647068' }}>{pro.type} · {pro.coverage_areas}</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor:'rgba(23,33,27,0.08)' }}>
                <X size={14} style={{ color:'#5C4A3A' }} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {[
                { label:'Your Name *',  key:'name',  type:'text', placeholder:'Full name' },
                { label:'Your Phone *', key:'phone', type:'tel',  placeholder:'+234 800 000 0000' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(23,33,27,0.5)' }}>{f.label}</label>
                  <input type={f.type} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder}
                    className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
                </div>
              ))}

              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(23,33,27,0.5)' }}>What do you need? (optional)</label>
                <textarea value={form.details} onChange={set('details')} rows={3}
                  placeholder={`Describe what you need from ${pro.full_name}...`}
                  className="input resize-none text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Urgency</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['normal','Normal'],['soon','This Week'],['urgent','Urgent']].map(([v,l]) => (
                    <button key={v} onClick={() => setForm(f => ({ ...f, urgency: v }))}
                      className="py-2.5 rounded-xl text-xs font-semibold border-2 transition-all"
                      style={{
                        borderColor:     form.urgency === v ? '#C85F2D' : '#DEDDD6',
                        backgroundColor: form.urgency === v ? 'rgba(200,95,45,0.06)' : '#FFFFFF',
                        color:           form.urgency === v ? '#C85F2D' : '#647068',
                      }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleSend} disabled={sending || !form.name || !form.phone}
                className="btn-primary w-full py-4"
                style={{ opacity: (!form.name || !form.phone) ? 0.5 : 1 }}>
                {sending ? 'Sending...' : `Send Request to ${pro.full_name.split(' ')[0]} →`}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

// ─── Pro Card (Swipe View) ────────────────────────────────
function ProSwipeCard({ pro, onPass, onSave, onContact }) {
  const x        = useMotionValue(0)
  const rotate   = useTransform(x, [-200, 200], [-18, 18])
  const likeOp   = useTransform(x, [30, 120],  [0, 1])
  const passOp   = useTransform(x, [-120, -30], [1, 0])
  const [dragging, setDragging] = useState(false)

  const handleDragEnd = (_, info) => {
    setDragging(false)
    if (info.offset.x > 100)       { onSave(pro);    return }
    if (info.offset.x < -100)      { onPass(pro);    return }
  }

  const EMOJI = { agent:'users', surveyor:'ruler', inspector:'search', valuer:'bar-chart-2', lawyer:'scale', lender:'landmark', architect:'hard-hat', contractor:'hammer' }
  const initials = pro.full_name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase()

  return (
    <motion.div
      style={{ x, rotate, position:'absolute', width:'100%', cursor: dragging ? 'grabbing' : 'grab' }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragStart={() => setDragging(true)}
      onDragEnd={handleDragEnd}
      whileTap={{ scale: 0.98 }}
    >
      {/* Like indicator */}
      <motion.div style={{ opacity: likeOp }}
        className="absolute top-6 left-6 z-20 pointer-events-none"
        initial={{ rotate: -15 }}>
        <div className="border-4 rounded-xl px-3 py-1 font-black text-lg uppercase tracking-widest"
          style={{ borderColor:'#7A9E7E', color:'#7A9E7E' }}>Save</div>
      </motion.div>

      {/* Pass indicator */}
      <motion.div style={{ opacity: passOp }}
        className="absolute top-6 right-6 z-20 pointer-events-none"
        initial={{ rotate: 15 }}>
        <div className="border-4 rounded-xl px-3 py-1 font-black text-lg uppercase tracking-widest"
          style={{ borderColor:'#C85F2D', color:'#C85F2D' }}>Skip</div>
      </motion.div>

      <div className="rounded-3xl overflow-hidden shadow-2xl select-none"
        style={{ backgroundColor:'#FFFAF5', border:'1px solid #DEDDD6', userSelect:'none', touchAction:'none' }}>

        {/* Avatar header */}
        <div className="relative h-48 flex items-center justify-center"
          style={{ background: 'linear-gradient(145deg, #17211B 0%, #1F2B24 100%)' }}>
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 30% 70%, #C85F2D 0%, transparent 60%), radial-gradient(circle at 70% 30%, #7A9E7E 0%, transparent 60%)' }} />
          {pro.avatar_url ? (
            <img src={pro.avatar_url} alt={pro.full_name} className="w-28 h-28 rounded-full object-cover border-4"
              style={{ borderColor:'rgba(255,255,255,0.2)' }} />
          ) : (
            <div className="w-28 h-28 rounded-full flex items-center justify-center border-4 relative"
              style={{ backgroundColor:'rgba(200,95,45,0.2)', borderColor:'rgba(200,95,45,0.4)' }}>
              <span className="font-display font-black text-4xl" style={{ color:'#C85F2D' }}>{initials}</span>
            </div>
          )}
          {/* Type badge */}
          <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ backgroundColor:'rgba(255,255,255,0.12)', color:'#FFFFFF', backdropFilter:'blur(8px)' }}>
            <span>{EMOJI[pro.type]}</span>
            <span className="capitalize">{pro.type}</span>
          </div>
          {/* Verified badge */}
          {pro.is_verified && (
            <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ backgroundColor:'rgba(122,158,126,0.25)', color:'#7A9E7E', border:'1px solid rgba(122,158,126,0.4)' }}>
              <Shield size={9} /> Verified
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-display font-black text-xl" style={{ color:'#17211B' }}>{pro.full_name}</h3>
              {pro.company_name && <p className="text-xs mt-0.5" style={{ color:'#C85F2D' }}>{pro.company_name}</p>}
            </div>
            <StarRating rating={pro.rating || 4.5} count={pro.review_count} size="sm" />
          </div>

          <div className="flex items-center gap-3 mb-3 text-xs" style={{ color:'#647068' }}>
            <div className="flex items-center gap-1">
              <MapPin size={11} style={{ color:'#C85F2D' }} />
              <span>{pro.coverage_areas}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock size={11} />
              <span>{pro.license_number || ""}</span>
            </div>
          </div>

          <p className="text-sm leading-relaxed mb-4 line-clamp-3" style={{ color:'#5C4A3A' }}>
            {pro.coverage_areas || ""}
          </p>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={() => onPass(pro)}
              className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all"
              style={{ borderColor:'rgba(200,95,45,0.3)', backgroundColor:'rgba(200,95,45,0.04)' }}>
              <X size={18} style={{ color:'#C85F2D' }} />
            </button>
            <button onClick={() => onContact(pro)}
              className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-all"
              style={{ backgroundColor:'#17211B', color:'#FFFFFF' }}>
              <MessageCircle size={15} /> Contact
            </button>
            <button onClick={() => onSave(pro)}
              className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all"
              style={{ borderColor:'rgba(122,158,126,0.4)', backgroundColor:'rgba(122,158,126,0.06)' }}>
              <Heart size={18} style={{ color:'#7A9E7E' }} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Pro Card (List View) ─────────────────────────────────
function ProListCard({ pro, onContact, onSave, saved }) {
  const EMOJI = { agent:'users', surveyor:'ruler', inspector:'search', valuer:'bar-chart-2', lawyer:'scale', lender:'landmark', architect:'hard-hat', contractor:'hammer' }
  const initials = pro.full_name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase()

  return (
    <motion.div layout initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
      className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor:'#FFFAF5', borderColor:'#DEDDD6' }}>
      <div className="flex gap-0">
        {/* Avatar */}
        <div className="w-20 flex-shrink-0 flex items-center justify-center"
          style={{ background:'linear-gradient(145deg,#17211B,#1F2B24)', minHeight:88 }}>
          {pro.avatar_url
            ? <img src={pro.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
            : <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor:'rgba(200,95,45,0.2)' }}>
                <span className="font-display font-black text-lg" style={{ color:'#C85F2D' }}>{initials}</span>
              </div>
          }
        </div>

        {/* Info */}
        <div className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <div>
              <p className="font-display font-black text-base" style={{ color:'#17211B' }}>{pro.full_name}</p>
              <p className="text-xs capitalize" style={{ color:'#C85F2D' }}>{EMOJI[pro.professional_type]} {pro.professional_type} · {pro.years_exp}yr exp</p>
            </div>
            {pro.is_verified && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0"
                style={{ backgroundColor:'rgba(122,158,126,0.12)', color:'#5C8060' }}>
                <Shield size={8} /> Verified
              </span>
            )}
          </div>
          <StarRating rating={pro.rating || 4.5} count={pro.review_count} />
          <p className="text-xs mt-1" style={{ color:'#647068' }}>{pro.coverage_areas}</p>
        </div>
      </div>

      <div className="flex gap-2 px-3 pb-3">
        <button onClick={() => onContact(pro)}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold"
          style={{ backgroundColor:'#C85F2D', color:'#FFFFFF' }}>
          Request Service
        </button>
        <button onClick={() => onSave(pro)}
          className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all"
          style={{
            borderColor: saved ? '#7A9E7E' : '#DEDDD6',
            backgroundColor: saved ? 'rgba(122,158,126,0.1)' : '#FFFFFF',
            color: saved ? '#7A9E7E' : '#647068',
          }}>
          <Heart size={13} fill={saved ? '#7A9E7E' : 'none'} />
        </button>
      </div>
    </motion.div>
  )
}

// ─── Main Page ────────────────────────────────────────────
export default function ProfessionalsPage() {
  const { user } = useAuth()
  const [pros,       setPros]       = useState([])
  const [queue,      setQueue]      = useState([])
  const [saved,      setSaved]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [viewMode,   setViewMode]   = useState('swipe') // 'swipe' | 'list'
  const [contactPro, setContactPro] = useState(null)
  const [empty,      setEmpty]      = useState(false)

  useEffect(() => { loadPros() }, [typeFilter])

  const loadPros = async () => {
    setLoading(true)
    setEmpty(false)
    let q = supabase
      .from('professional_applications')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
    if (typeFilter !== 'all') q = q.eq('professional_type', typeFilter)

    const { data } = await q
    // Show only real, active professionals. No fake fallback list, no
    // randomly generated ratings - a professional with zero reviews
    // simply shows zero reviews until a real client rates them.
    const list = (data || []).map(p => ({
      ...p,
      rating:       p.rating       || 0,
      review_count: p.review_count || 0,
      is_verified:  true,
    }))

    setPros(list)
    setQueue([...list])
    setLoading(false)
    if (!list.length) setEmpty(true)
  }

  const handlePass  = useCallback((pro) => setQueue(q => q.filter(p => p.id !== pro.id)), [])
  const handleSave  = useCallback((pro) => {
    setSaved(s => s.includes(pro.id) ? s : [...s, pro.id])
    setQueue(q => q.filter(p => p.id !== pro.id))
    toast.success(`${pro.full_name.split(' ')[0]} saved!`)
  }, [])

  const topCard   = queue[queue.length - 1]
  const stackSize = Math.min(queue.length, 3)

  return (
    <div className="min-h-screen pt-20 pb-20" style={{ backgroundColor:'#F5EDE0' }}>
      <div className="max-w-lg mx-auto px-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color:'#17211B' }}>Work With Someone Who's Actually Trusted.</h1>
            <p className="text-xs mt-0.5" style={{ color:'#647068' }}>Agents and inspectors with a track record you can check, not just a business card.</p>
          </div>
          {/* View mode toggle */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor:'#DEDDD6' }}>
            {[['swipe','Swipe'],['list','List']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)}
                className="px-3 py-2 text-xs font-semibold transition-all"
                style={{
                  backgroundColor: viewMode === v ? '#17211B' : '#FFFFFF',
                  color:           viewMode === v ? '#FFFFFF'  : '#647068',
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Apply banner - the only entry point for professionals to join and pay */}
        <Link to="/apply-professional"
          className="flex items-center justify-between gap-3 rounded-2xl p-4 mb-5"
          style={{ backgroundColor: '#17211B' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: '#FFFFFF' }}>Are you a professional?</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Join for N25,000/month and get matched with clients
            </p>
          </div>
          <span className="px-4 py-2 rounded-xl text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: '#C85F2D', color: '#FFFFFF' }}>
            Apply →
          </span>
        </Link>

        {/* Type filter */}
        <div className="flex gap-2 overflow-x-auto mb-6 pb-1" style={{ scrollbarWidth:'none' }}>
          {PRO_TYPES.map(t => (
            <button key={t.id} onClick={() => setTypeFilter(t.id)}
              className="px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 flex items-center gap-1 transition-all"
              style={{
                backgroundColor: typeFilter === t.id ? '#17211B' : '#FFFFFF',
                color:           typeFilter === t.id ? '#FFFFFF'  : '#5C4A3A',
                borderColor:     typeFilter === t.id ? '#17211B'  : '#DEDDD6',
              }}>
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="flex justify-center mb-3"><Briefcase size={40} className="text-terracotta animate-bounce" /></div>
              <p className="text-sm" style={{ color:'#647068' }}>Finding professionals...</p>
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && empty && (
          <div className="rounded-3xl p-10 text-center border" style={{ backgroundColor:'#FFFAF5', borderColor:'#DEDDD6' }}>
            <div className="flex justify-center mb-4"><Search size={48} className="text-terracotta" /></div>
            <h3 className="font-display font-black text-xl mb-2" style={{ color:'#17211B' }}>
              {typeFilter === 'all' ? 'No professionals listed yet' : 'No professionals in this category yet'}
            </h3>
            <p className="text-sm mb-4" style={{ color:'#647068' }}>
              {typeFilter === 'all'
                ? 'Be one of the first verified professionals on DealMatch.'
                : 'Try a different category, or check back soon.'}
            </p>
            {typeFilter === 'all' ? (
              <Link to="/apply-professional" className="btn-primary px-6 py-3 text-sm inline-flex">Apply as a Professional</Link>
            ) : (
              <button onClick={() => setTypeFilter('all')} className="btn-primary px-6 py-3 text-sm">Show All</button>
            )}
          </div>
        )}

        {/* Swipe mode */}
        {!loading && !empty && viewMode === 'swipe' && (
          <>
            {queue.length > 0 ? (
              <>
                <div className="relative mb-4" style={{ height: 480 }}>
                  {[...queue].reverse().slice(0, 3).map((pro, i, arr) => {
                    const isTop  = i === arr.length - 1
                    const offset = arr.length - 1 - i
                    return (
                      <div key={pro.id}
                        style={{
                          position: 'absolute', inset: 0,
                          transform: `scale(${1 - offset * 0.04}) translateY(${offset * -10}px)`,
                          transformOrigin: 'bottom center',
                          zIndex: i,
                          pointerEvents: isTop ? 'auto' : 'none',
                        }}>
                        {isTop
                          ? <ProSwipeCard pro={pro} onPass={handlePass} onSave={handleSave} onContact={setContactPro} />
                          : <div className="rounded-3xl w-full h-full opacity-50"
                              style={{ backgroundColor:'#FFFAF5', border:'1px solid #DEDDD6' }} />
                        }
                      </div>
                    )
                  })}
                </div>

                {/* Swipe hint */}
                <div className="flex items-center justify-center gap-8 mb-5 text-xs" style={{ color:'#647068' }}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs"
                      style={{ borderColor:'#C85F2D', color:'#C85F2D' }}><X size={18} /></div>
                    <span>Skip</span>
                  </div>
                  <div className="text-xs font-semibold" style={{ color:'rgba(23,33,27,0.3)' }}>swipe left / right</div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs"
                      style={{ borderColor:'#7A9E7E', color:'#7A9E7E' }}><Heart size={18} /></div>
                    <span>Save</span>
                  </div>
                </div>

                {/* Remaining count */}
                <p className="text-center text-xs" style={{ color:'#647068' }}>
                  {queue.length} professional{queue.length !== 1 ? 's' : ''} remaining
                </p>
              </>
            ) : (
              <div className="rounded-3xl p-10 text-center" style={{ backgroundColor:'#FFFAF5' }}>
                <div className="flex justify-center mb-4"><PartyPopper size={48} className="text-gold" /></div>
                <h3 className="font-display font-black text-xl mb-2" style={{ color:'#17211B' }}>You've seen everyone!</h3>
                <p className="text-sm mb-6" style={{ color:'#647068' }}>
                  {saved.length > 0 ? `You saved ${saved.length} professional${saved.length > 1 ? 's' : ''}.` : 'No one saved yet.'}
                </p>
                <button onClick={loadPros} className="btn-primary px-8 py-3 text-sm">Refresh</button>
              </div>
            )}

            {/* Saved professionals list */}
            {saved.length > 0 && (
              <div className="mt-8">
                <h3 className="font-display font-black text-base mb-3" style={{ color:'#17211B' }}>
                  Saved ({saved.length})
                </h3>
                <div className="space-y-3">
                  {pros.filter(p => saved.includes(p.id)).map(pro => (
                    <ProListCard key={pro.id} pro={pro} onContact={setContactPro}
                      onSave={handleSave} saved={true} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* List mode */}
        {!loading && !empty && viewMode === 'list' && (
          <div className="space-y-3">
            {pros.map(pro => (
              <ProListCard key={pro.id} pro={pro} onContact={setContactPro}
                onSave={handleSave} saved={saved.includes(pro.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Contact modal */}
      <AnimatePresence>
        {contactPro && <ContactModal pro={contactPro} onClose={() => setContactPro(null)} />}
      </AnimatePresence>
    </div>
  )
}
