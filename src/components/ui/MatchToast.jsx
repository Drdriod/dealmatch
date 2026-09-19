import { motion, AnimatePresence } from 'framer-motion'
import { Heart, Home, X } from 'lucide-react'
import React, { useState, useEffect } from 'react'

export default function MatchToast({ property, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [])

  if (!property) return null
  const img = property.images?.find(i => i.is_primary)?.url || property.images?.[0]?.url

  return (
    <motion.div
      initial={{ opacity: 0, y: -80, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -60, scale: 0.9 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[90] w-full max-w-xs mx-auto"
      style={{ padding: '0 16px' }}
    >
      <div className="rounded-2xl overflow-hidden shadow-2xl flex items-center gap-3 p-3"
        style={{ backgroundColor: '#1A1210', border: '1px solid rgba(201,106,58,0.4)' }}>
        {img ? (
          <img src={img} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: 'rgba(201,106,58,0.15)' }}><Home size={24} className="text-terracotta" /></div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Heart size={11} fill="#C96A3A" style={{ color: '#C96A3A' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#C96A3A' }}>
              New Match!
            </span>
          </div>
          <p className="text-sm font-bold text-white truncate">{property.title}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {property.city}, {property.state}
          </p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center flex-shrink-0"
          style={{ color: 'rgba(255,255,255,0.3)' }}>
          <X size={14} />
        </button>
      </div>
    </motion.div>
  )
}
