import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronLeft, ChevronRight, Expand, Home, X } from 'lucide-react'

export default function ImageGallery({ images = [], title = '' }) {
  const [activeIdx, setActiveIdx]   = useState(0)
  const [lightbox, setLightbox]     = useState(false)

  const filtered = images.filter(i => i?.url)
  if (!filtered.length) return (
    <div className="w-full h-64 rounded-3xl flex items-center justify-center text-6xl"
      style={{ backgroundColor: 'rgba(200,95,45,0.08)' }}>
      <Home size={48} className="text-terracotta" />
    </div>
  )

  const prev = () => setActiveIdx(i => (i - 1 + filtered.length) % filtered.length)
  const next = () => setActiveIdx(i => (i + 1) % filtered.length)

  return (
    <>
      <div className="relative rounded-3xl overflow-hidden" style={{ height: 300 }}>
        <img src={filtered[activeIdx]?.url} alt={title}
          className="w-full h-full object-cover" />
        {filtered.length > 1 && (
          <>
            <button onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{ backgroundColor: 'rgba(23,33,27,0.5)' }}>
              <ChevronLeft size={16} color="white" />
            </button>
            <button onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{ backgroundColor: 'rgba(23,33,27,0.5)' }}>
              <ChevronRight size={16} color="white" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {filtered.map((_, i) => (
                <button key={i} onClick={() => setActiveIdx(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === activeIdx ? 18 : 6,
                    height: 6,
                    backgroundColor: i === activeIdx ? '#C85F2D' : 'rgba(255,255,255,0.6)',
                  }} />
              ))}
            </div>
          </>
        )}
        <button onClick={() => setLightbox(true)}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(23,33,27,0.5)' }}>
          <Expand size={13} color="white" />
        </button>
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ backgroundColor: 'rgba(23,33,27,0.6)', color: '#FFFFFF' }}>
          {activeIdx + 1} / {filtered.length}
        </div>
      </div>

      {/* Thumbnail strip */}
      {filtered.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {filtered.map((img, i) => (
            <button key={i} onClick={() => setActiveIdx(i)}
              className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all"
              style={{ borderColor: i === activeIdx ? '#C85F2D' : 'transparent' }}>
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
            onClick={() => setLightbox(false)}>
            <button className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <X size={18} color="white" />
            </button>
            <img src={filtered[activeIdx]?.url} alt={title}
              className="max-w-full max-h-full rounded-2xl object-contain"
              onClick={e => e.stopPropagation()} />
            {filtered.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); prev() }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <ChevronLeft size={18} color="white" />
                </button>
                <button onClick={e => { e.stopPropagation(); next() }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <ChevronRight size={18} color="white" />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
