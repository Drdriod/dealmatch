import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bath, Bed, ChevronLeft, ChevronRight, Heart, Home, MapPin, Maximize } from 'lucide-react'
import { Link } from 'react-router-dom'
import { recordSwipe } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const formatPrice = (n) => {
  if (!n) return '₦0'
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  return `₦${(n / 1_000).toFixed(0)}K`
}

/**
 * Horizontal carousel of property cards.
 * Used on HomePage featured listings, Matches, etc.
 */
export default function PropertyCarousel({ properties = [], title, subtitle, emptyText = 'No properties yet' }) {
  const { user } = useAuth()
  const [liked,  setLiked]  = useState(new Set())
  const [idx,    setIdx]    = useState(0)

  const visible = 3
  const canPrev = idx > 0
  const canNext = idx + visible < properties.length

  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIdx(i => Math.min(properties.length - visible, i + 1)), [properties.length])

  const handleLike = async (e, property) => {
    e.preventDefault()
    if (!user) { toast.error('Sign in to save matches'); return }
    await recordSwipe({ userId: user.id, propertyId: property.id, action: 'like' })
    setLiked(prev => new Set([...prev, property.id]))
    toast.success('Added to matches!')
  }

  if (!properties.length) return (
    <div className="text-center py-10" style={{ color:'#647068' }}>
      <div className="flex justify-center mb-2"><Home size={40} className="text-terracotta" /></div>
      <p className="text-sm">{emptyText}</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      {(title || subtitle) && (
        <div className="flex items-end justify-between mb-6">
          <div>
            {title    && <h2 className="font-display font-black text-2xl md:text-3xl" style={{ color:'#17211B' }}>{title}</h2>}
            {subtitle && <p className="text-sm mt-1" style={{ color:'#647068' }}>{subtitle}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={prev} disabled={!canPrev}
              className="w-9 h-9 rounded-full border flex items-center justify-center transition-all"
              style={{ borderColor: canPrev ? '#C85F2D' : '#DEDDD6', color: canPrev ? '#C85F2D' : '#C8C0B8', backgroundColor:'#FFFFFF' }}>
              <ChevronLeft size={16} />
            </button>
            <button onClick={next} disabled={!canNext}
              className="w-9 h-9 rounded-full border flex items-center justify-center transition-all"
              style={{ borderColor: canNext ? '#C85F2D' : '#DEDDD6', color: canNext ? '#C85F2D' : '#C8C0B8', backgroundColor:'#FFFFFF' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="overflow-hidden">
        <motion.div
          className="flex gap-4"
          animate={{ x: `calc(-${idx * (100 / visible)}% - ${idx * 16 / visible}px)` }}
          transition={{ type:'spring', damping:28, stiffness:260 }}
        >
          {properties.map(p => {
            const img    = p.images?.find(i => i?.is_primary)?.url || p.images?.[0]?.url
            const isLiked = liked.has(p.id)
            const EMOJI  = { land: 'land', apartment: 'apartment', duplex: 'duplex', detached: 'detached', terrace: 'terrace', commercial: 'commercial', hotel:'hotel', rental:'key' }

            return (
              <Link
                key={p.id}
                to={`/property/${p.id}`}
                className="flex-shrink-0 rounded-2xl overflow-hidden border group transition-all hover:-translate-y-1"
                style={{ width:`calc(${100 / visible}% - ${(visible - 1) * 16 / visible}px)`, backgroundColor:'#FFFAF5', borderColor:'#DEDDD6', boxShadow:'0 2px 12px rgba(23,33,27,0.06)' }}>
                {/* Image */}
                <div className="relative h-44 overflow-hidden">
                  {img
                    ? <img src={img} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ backgroundColor:'rgba(200,95,45,0.08)' }}>{EMOJI[p.property_type] || 'home'}</div>
                  }
                  {/* Like button */}
                  <button onClick={e => handleLike(e, p)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all"
                    style={{ backgroundColor: isLiked ? 'rgba(200,95,45,0.9)' : 'rgba(255,255,255,0.85)', backdropFilter:'blur(4px)' }}>
                    <Heart size={14} fill={isLiked ? '#FFFFFF' : 'none'} style={{ color: isLiked ? '#FFFFFF' : '#C85F2D' }} />
                  </button>
                  {/* Category badge */}
                  <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold"
                    style={{ backgroundColor:'rgba(23,33,27,0.7)', color:'#FFFFFF' }}>
                    {p.listing_type || p.category}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <p className="font-display font-black text-base mb-0.5" style={{ color:'#C85F2D' }}>{formatPrice(p.price)}</p>
                  <p className="font-semibold text-sm truncate mb-1" style={{ color:'#17211B' }}>{p.title}</p>
                  <div className="flex items-center gap-1 text-xs mb-2" style={{ color:'#647068' }}>
                    <MapPin size={10} style={{ color:'#C85F2D' }} />
                    <span className="truncate">{p.city}, {p.state}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color:'#647068' }}>
                    {p.bedrooms  && <span className="flex items-center gap-0.5"><Bed size={10} /> {p.bedrooms}</span>}
                    {p.bathrooms && <span className="flex items-center gap-0.5"><Bath size={10} /> {p.bathrooms}</span>}
                    {p.size_sqm  && <span className="flex items-center gap-0.5"><Maximize size={10} /> {p.size_sqm}sqm</span>}
                  </div>
                </div>
              </Link>
            )
          })}
        </motion.div>
      </div>
    </div>
  )
}
