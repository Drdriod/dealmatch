import React, { useState, useEffect } from 'react'
import { Star, Quote, Send, X, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeUp, StaggerChildren, StaggerItem } from '@/components/ui/ScrollReveal'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

// ─── Star rating input/display ─────────────────────────────
function Stars({ value, onChange, size = 16 }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star
            size={size}
            fill={n <= value ? '#D4A853' : 'transparent'}
            style={{ color: n <= value ? '#D4A853' : '#C9BEB2' }}
          />
        </button>
      ))}
    </div>
  )
}

// ─── Submission modal ───────────────────────────────────────
function SubmitTestimonialModal({ onClose, onSubmitted }) {
  const { user, profile } = useAuth()
  const [rating, setRating]   = useState(5)
  const [content, setContent] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [saving, setSaving]   = useState(false)

  const submit = async () => {
    if (!content.trim() || content.trim().length < 20) {
      toast.error('Tell us a bit more - at least 20 characters')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('testimonials').insert({
      user_id: user.id,
      name: profile?.full_name || user.email?.split('@')[0] || 'DealMatch User',
      role_label: roleLabel.trim() || null,
      content: content.trim(),
      rating,
      status: 'pending',
    })
    setSaving(false)
    if (error) {
      // Log the real Postgres/PostgREST error so this is diagnosable next
      // time - the toast below is deliberately generic-sounding for most
      // cases, which previously meant swallowing the actual reason
      // (RLS code 42501, FK violation 23503, etc.) with no trace anywhere.
      console.error('[testimonials.insert] failed:', error)
      if (error.code === '23505' || error.message?.includes('duplicate')) {
        toast.error('You already have a testimonial submitted')
      } else if (error.code === '42501' || error.message?.includes('row-level security')) {
        // The RLS policy on this table blocks a second submission while an
        // existing one is pending/approved, but 42501 can also fire for an
        // unrelated policy problem. Check what's actually on record instead
        // of assuming the friendly reason - a wrong guess here is worse
        // than the generic message, since it tells the person something
        // false about their own account.
        const { data: existing } = await supabase
          .from('testimonials')
          .select('status')
          .eq('user_id', user.id)
          .neq('status', 'rejected')
          .order('created_at', { ascending: false })
          .maybeSingle()
        toast.error(existing
          ? 'You already have a pending or approved testimonial'
          : 'Could not submit. Please try again.')
      } else if (error.code === '23503') {
        toast.error('Your profile isn\u2019t fully set up yet - please refresh and try again')
      } else {
        toast.error('Could not submit. Please try again.')
      }
      return
    }
    toast.success('Thank you! Your story will appear once reviewed.')
    onSubmitted?.()
    onClose()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(26,18,16,0.6)' }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-6" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-black text-xl" style={{ color: '#1A1210' }}>Share Your Story</h3>
          <button onClick={onClose}><X size={20} style={{ color: '#8A7E78' }} /></button>
        </div>

        <div className="mb-4">
          <label className="text-xs font-bold mb-2 block" style={{ color: '#8A7E78' }}>Your Rating</label>
          <Stars value={rating} onChange={setRating} size={26} />
        </div>

        <div className="mb-4">
          <label className="text-xs font-bold mb-1.5 block" style={{ color: '#8A7E78' }}>
            How would you describe yourself? <span style={{ opacity: 0.6 }}>(optional)</span>
          </label>
          <input
            value={roleLabel}
            onChange={e => setRoleLabel(e.target.value)}
            placeholder="e.g. Tenant in Lekki, First-time buyer"
            maxLength={80}
            className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
            style={{ backgroundColor: '#FAF6F0', border: '1px solid #E8DDD2', color: '#1A1210' }}
          />
        </div>

        <div className="mb-5">
          <label className="text-xs font-bold mb-1.5 block" style={{ color: '#8A7E78' }}>Your Experience</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            maxLength={600}
            placeholder="Tell other Nigerians about your experience finding a match with DealMatch..."
            className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none"
            style={{ backgroundColor: '#FAF6F0', border: '1px solid #E8DDD2', color: '#1A1210' }}
          />
          <p className="text-xs mt-1 text-right" style={{ color: '#C9BEB2' }}>{content.length}/600</p>
        </div>

        <button onClick={submit} disabled={saving}
          className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: '#D4A853', color: '#1A1210' }}>
          {saving
            ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <><Send size={14} /> Submit for Review</>
          }
        </button>
        <p className="text-xs text-center mt-3" style={{ color: '#C9BEB2' }}>
          Reviewed by our team before appearing publicly.
        </p>
      </motion.div>
    </motion.div>
  )
}

// ─── Main public section ─────────────────────────────────────
export default function TestimonialsSection() {
  const { isAuthenticated, user } = useAuth()
  const [testimonials, setTestimonials] = useState([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [ownStatus, setOwnStatus]       = useState(null) // null | 'pending' | 'approved' | 'rejected'

  const load = async () => {
    const { data } = await supabase
      .from('testimonials')
      .select('id, name, role_label, content, rating, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(9)
    setTestimonials(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (isAuthenticated && user) {
      supabase.from('testimonials').select('status').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => setOwnStatus(data?.status || null))
    }
  }, [isAuthenticated, user])

  return (
    <section className="py-24 px-6" style={{ backgroundColor: '#FAF6F0' }}>
      <div className="max-w-6xl mx-auto">
        <FadeUp>
          <div className="text-center mb-16">
            <p className="section-tag">Real Stories</p>
            <h2 className="section-title mb-4">What Nigerians Are Saying</h2>
            <p className="section-sub mx-auto mb-6">Real experiences from people who found their match through DealMatch.</p>
            {isAuthenticated ? (
              ownStatus ? (
                <p className="text-xs font-semibold inline-flex items-center gap-1.5" style={{ color: '#7A9E7E' }}>
                  <CheckCircle size={13} />
                  {ownStatus === 'approved' ? 'Your story is live above - thank you!'
                    : ownStatus === 'pending' ? 'Your story is awaiting review'
                    : 'Your last submission wasn\'t approved - feel free to submit another'}
                </p>
              ) : (
                <button onClick={() => setShowModal(true)}
                  className="text-sm font-bold underline" style={{ color: '#C96A3A' }}>
                  Share your own story →
                </button>
              )
            ) : (
              <p className="text-xs" style={{ color: '#8A7E78' }}>
                Sign in to share your own experience.
              </p>
            )}
          </div>
        </FadeUp>

        {loading ? null : testimonials.length === 0 ? (
          <p className="text-center text-sm" style={{ color: '#8A7E78' }}>
            Be the first to share your DealMatch story.
          </p>
        ) : (
          <StaggerChildren className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <StaggerItem key={t.id}>
                <div className="rounded-3xl p-6 h-full flex flex-col"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DDD2' }}>
                  <Quote size={22} style={{ color: '#E8DDD2' }} className="mb-3" />
                  <Stars value={t.rating} size={14} />
                  <p className="text-sm leading-relaxed mt-3 mb-4 flex-1" style={{ color: '#1A1210' }}>
                    "{t.content}"
                  </p>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#1A1210' }}>{t.name}</p>
                    {t.role_label && (
                      <p className="text-xs" style={{ color: '#8A7E78' }}>{t.role_label}</p>
                    )}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <SubmitTestimonialModal
            onClose={() => setShowModal(false)}
            onSubmitted={() => { setOwnStatus('pending'); load() }}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
