import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowRight, Home, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { searchActiveProperties } from '@/data/searchRepository'

export default function SearchPalette({ isOpen, onClose }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const inputRef                = useRef(null)
  const navigate                = useNavigate()

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const { data } = await searchActiveProperties(query)
      setResults(data || [])
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const goTo = (id) => {
    navigate(`/property/${id}`)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4"
          style={{ backgroundColor: 'rgba(23,33,27,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => e.target === e.currentTarget && onClose()}>
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: '#FFFAF5' }}>
            <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: '#DEDDD6' }}>
              <Search size={18} style={{ color: 'rgba(23,33,27,0.35)', flexShrink: 0 }} />
              <input ref={inputRef} type="text" value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search properties, cities, states..."
                className="flex-1 bg-transparent outline-none text-base"
                style={{ color: '#17211B' }} />
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(23,33,27,0.08)' }}>
                <X size={14} style={{ color: '#5C4A3A' }} />
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {loading && (
                <div className="py-6 text-center text-sm" style={{ color: '#647068' }}>Searching...</div>
              )}
              {!loading && results.length === 0 && query.length > 1 && (
                <div className="py-6 text-center text-sm" style={{ color: '#647068' }}>No properties found</div>
              )}
              {results.map(p => (
                <button key={p.id} onClick={() => goTo(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b text-left transition-colors hover:bg-[#F5EDE0]"
                  style={{ borderColor: '#DEDDD6' }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: 'rgba(200,95,45,0.08)' }}>
                    <Home size={40} className="text-terracotta" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#17211B' }}>{p.title}</p>
                    <p className="text-xs" style={{ color: '#647068' }}>
                      {p.city}, {p.state} · ₦{Number(p.price).toLocaleString()}
                    </p>
                  </div>
                  <ArrowRight size={14} style={{ color: '#C85F2D', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
