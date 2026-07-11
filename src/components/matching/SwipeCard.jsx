import React, { useState, useRef, useCallback } from 'react'
import { Bath, Bed, Heart, MapPin, Maximize, Star, X } from 'lucide-react'
import { recordSwipe } from '@/lib/supabase'
import { analytics } from '@/lib/posthog'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const formatPrice = (n) => {
  if (!n) return '₦0'
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  return `₦${(n / 1_000).toFixed(0)}K`
}

export default function SwipeCard({ property, matchScore, matchReasons = [], onSwipe }) {
  const { user }  = useAuth()
  const [offset, setOffset]     = useState({ x: 0, y: 0 })
  const [exiting, setExiting]   = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const startPos  = useRef(null)
  const cardRef   = useRef(null)
  const hasDragged = useRef(false)

  const images = property?.images?.filter(i => i?.url) || []
  const primaryImg = images.find(i => i.is_primary)?.url || images[0]?.url

  // ─── Drag handlers ────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    // Don't drag if clicking a button
    if (e.target.closest('[data-action]')) return
    startPos.current = { x: e.clientX, y: e.clientY }
    hasDragged.current = false
    cardRef.current?.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e) => {
    if (!startPos.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasDragged.current = true
      setIsDragging(true)
    }
    if (hasDragged.current) {
      setOffset({ x: dx, y: dy * 0.3 })
    }
  }, [])

  const onPointerUp = useCallback(() => {
    if (!startPos.current) return
    const { x } = offset
    startPos.current = null
    setIsDragging(false)

    if (!hasDragged.current) { setOffset({ x: 0, y: 0 }); return }

    if (x > 100)       swipe('like')
    else if (x < -100) swipe('pass')
    else               setOffset({ x: 0, y: 0 })
  }, [offset])

  // ─── Swipe action ─────────────────────────────────────
  const swipe = useCallback(async (action) => {
    if (exiting) return
    setExiting(action)
    setTimeout(async () => {
      if (user) {
        await recordSwipe({ userId: user.id, propertyId: property.id, action })
        if (action === 'like')  analytics.propertyLiked(property.id, matchScore)
        if (action === 'pass')  analytics.propertyPassed(property.id)
        if (action === 'super') analytics.propertySuperLiked(property.id)
      }
      onSwipe?.(action, property)
    }, 380)

    if (action === 'like')  toast.success('Added to your matches!')
    if (action === 'super') toast.success('⭐ Super liked! Agent will contact you.')
  }, [exiting, user, property, matchScore, onSwipe])

  // ─── Transform calculation ────────────────────────────
  const rotation = isDragging ? offset.x / 20 : 0
  const likeOpacity = Math.max(0, Math.min(1, offset.x / 80))
  const passOpacity = Math.max(0, Math.min(1, -offset.x / 80))

  let transform = `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`
  let opacity = 1
  if (exiting === 'like' || exiting === 'super') {
    transform = 'translateX(130vw) rotate(20deg)'
    opacity = 0
  } else if (exiting === 'pass') {
    transform = 'translateX(-130vw) rotate(-20deg)'
    opacity = 0
  }

  const PROP_EMOJI = {
    land: 'land', apartment: 'apartment', duplex: 'duplex',
    detached: 'detached', terrace: 'terrace', commercial: 'commercial',
  }

  return (
    <div
      ref={cardRef}
      className="swipe-card select-none w-full max-w-sm mx-auto relative"
      style={{
        transform,
        opacity,
        transition: isDragging ? 'none' : 'transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.38s ease',
        touchAction: 'none',
        willChange: 'transform',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Like indicator */}
      <div className="absolute top-6 left-6 z-20 pointer-events-none" style={{ opacity: likeOpacity, transform: 'rotate(-15deg)' }}>
        <div className="border-4 border-sage text-sage font-black text-xl px-4 py-1 rounded-xl uppercase tracking-widest">
          Match
        </div>
      </div>

      {/* Pass indicator */}
      <div className="absolute top-6 right-6 z-20 pointer-events-none" style={{ opacity: passOpacity, transform: 'rotate(15deg)' }}>
        <div className="border-4 border-terracotta text-terracotta font-black text-xl px-4 py-1 rounded-xl uppercase tracking-widest">
          Nope
        </div>
      </div>

      {/* Image */}
      <div className="relative h-72 overflow-hidden bg-gradient-to-br from-blush to-terracotta/30 rounded-t-[2rem]">
        {primaryImg ? (
          <img
            src={primaryImg}
            alt={property?.title}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-7xl">
            {PROP_EMOJI[property?.property_type] || 'house'}
          </div>
        )}
        {matchScore != null && (
          <div className="match-pill absolute bottom-4 right-4 z-10">{matchScore}% Match</div>
        )}
        <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm text-deep text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide">
          {property?.listing_type || 'For Sale'}
        </div>
      </div>

      {/* Info */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-display text-2xl font-black text-deep leading-tight">
            {formatPrice(property?.price)}
          </h3>
          <span className="text-xs text-deep/40 bg-deep/5 px-2 py-1 rounded-full capitalize flex-shrink-0 ml-2">
            {property?.property_type}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-deep/40 text-sm mb-3">
          <MapPin size={13} className="flex-shrink-0" />
          <span className="truncate">{property?.city}, {property?.state}</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-deep/60 mb-4">
          {property?.bedrooms  && <span className="flex items-center gap-1"><Bed size={13} /> {property.bedrooms} bed</span>}
          {property?.bathrooms && <span className="flex items-center gap-1"><Bath size={13} /> {property.bathrooms} bath</span>}
          {property?.size_sqm  && <span className="flex items-center gap-1"><Maximize size={13} /> {property.size_sqm}sqm</span>}
        </div>
        {matchReasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {matchReasons.slice(0, 3).map((r, i) => (
              <span key={i} className="text-xs bg-terracotta/8 text-terracotta px-2.5 py-1 rounded-full font-medium">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 px-5 pb-5">
        <button data-action="pass" onClick={() => swipe('pass')}
          className="flex-1 h-14 rounded-2xl bg-deep/5 hover:bg-red-50 text-deep/40 hover:text-red-400 transition-all flex items-center justify-center">
          <X size={22} />
        </button>
        <button data-action="super" onClick={() => swipe('super')}
          className="w-12 h-14 rounded-2xl bg-gold/10 hover:bg-gold/20 text-gold transition-all flex items-center justify-center flex-shrink-0">
          <Star size={18} />
        </button>
        <button data-action="like" onClick={() => swipe('like')}
          className="flex-1 h-14 rounded-2xl bg-terracotta hover:bg-terracotta-600 text-white shadow-glow transition-all flex items-center justify-center">
          <Heart size={22} />
        </button>
      </div>
    </div>
  )
}
