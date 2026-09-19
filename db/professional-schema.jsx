import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, MapPin, Home, Users, X, TrendingUp, ArrowRight } from 'lucide-react'
import { getProperties } from '@/lib/supabase'
import clsx from 'clsx'

const QUICK_ACTIONS = [
  { id: 'browse',       label: 'Browse All Deals',            icon: <Home size={15} />,      path: '/browse',        tag: 'Page' },
  { id: 'professionals',label: 'Find Professionals',          icon: <Users size={15} />,     path: '/professionals', tag: 'Page' },
  { id: 'list',         label: 'List a Property',             icon: <TrendingUp size={15} />,path: '/list',          tag: 'Action' },
  { id: 'matches',      label: 'View My Matches',             icon: <Home size={15} />,      path: '/matches',       tag: 'Page' },
]

const POPULAR_SEARCHES = [
  'Land in Uyo', '3-bed Lagos', 'Commercial Abuja', 'Plot Lekki', 'Duplex Port Harcourt',
]

const formatPrice = (n) => {
  if (!n) return ''
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  return `₦${(n / 1_000).toFixed(0)}K`
}

export default function SearchPalette({ isOpen, onClose }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80)
      setQuery('')
      setResults([])
      setActiveIdx(0)
    }
  }, [isOpen])

  -- Search debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      const { data } = await getProperties({ limit: 6 })
      -- Filter by query (client-side for now: replace with Supabase full-text search)
      const q = query.toLowerCase()
      const filtered = (data || []).filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.state?.toLowerCase().includes(q) ||
        p.property_type?.toLowerCase().includes(q)
      )
      setResults(filtered)
      setLoading(false)
    }, 280)
    return () => clearTimeout(timer)
  }, [query])

  -- Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    const items = query ? results : QUICK_ACTIONS
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, items.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Escape')    onClose()
    if (e.key === 'Enter') {
      if (query && results[activeIdx]) {
        navigate(`/property/${results[activeIdx].id}`)
        onClose()
      } else if (!query && QUICK_ACTIONS[activeIdx]) {
        navigate(QUICK_ACTIONS[activeIdx].path)
        onClose()
      }
    }
  }, [query, results, activeIdx, navigate, onClose])

  const go = (path) => { navigate(path); onClose() }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
          onClick={onClose}>

          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-deep/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />

          {/* Palette */}
          <motion.div
            className="relative w-full max-w-xl bg-white rounded-3xl shadow-[0_40px_100px_rgba(0,0,0,0.3)] overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-deep/8">
              <Search size={18} className="text-deep/30 flex-shrink-0" />
              <input
                ref={inputRef}
                className="flex-1 text-base text-deep placeholder:text-deep/30 outline-none bg-transparent"
                placeholder="Search properties, locations, types..."
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
                onKeyDown={handleKeyDown}
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-deep/30 hover:text-deep transition-colors">
                  <X size={16} />
                </button>
              )}
              <kbd className="hidden md:flex items-center gap-1 text-xs text-deep/25 bg-deep/5 px-2 py-1 rounded-lg font-mono">ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[420px] overflow-y-auto">
              {!query && (
                <>
                  <div className="px-5 pt-4 pb-2">
                    <p className="text-xs font-bold text-deep/30 uppercase tracking-wider">Quick Actions</p>
                  </div>
                  {QUICK_ACTIONS.map((action, i) => (
                    <button key={action.id} onClick={() => go(action.path)}
                      className={clsx('w-full flex items-center gap-3 px-5 py-3 transition-colors text-left',
                        activeIdx === i ? 'bg-terracotta/8' : 'hover:bg-cream'
                      )}>
                      <div className="w-8 h-8 rounded-xl bg-deep/5 flex items-center justify-center text-deep/50 flex-shrink-0">{action.icon}</div>
                      <span className="flex-1 text-sm font-medium text-deep">{action.label}</span>
                      <span className="text-xs text-deep/30 bg-deep/5 px-2 py-0.5 rounded-full">{action.tag}</span>
                    </button>
                  ))}

                  <div className="px-5 pt-4 pb-2 mt-2 border-t border-deep/5">
                    <p className="text-xs font-bold text-deep/30 uppercase tracking-wider mb-3">Popular Searches</p>
                    <div className="flex flex-wrap gap-2 pb-3">
                      {POPULAR_SEARCHES.map(s => (
                        <button key={s} onClick={() => setQuery(s)}
                          className="flex items-center gap-1.5 text-xs bg-deep/5 text-deep/60 hover:bg-terracotta/10 hover:text-terracotta px-3 py-1.5 rounded-full transition-colors">
                          <TrendingUp size={10} /> {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {query && loading && (
                <div className="flex items-center justify-center py-10 text-deep/30 text-sm gap-2">
                  <div className="w-4 h-4 border-2 border-deep/20 border-t-terracotta rounded-full animate-spin" />
                  Searching...
                </div>
              )}

              {query && !loading && results.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-4xl mb-3">🔍</p>
                  <p className="text-deep/40 text-sm">No properties found for <strong>"{query}"</strong></p>
                  <p className="text-deep/25 text-xs mt-1">Try a different location or property type</p>
                </div>
              )}

              {query && !loading && results.length > 0 && (
                <>
                  <div className="px-5 pt-4 pb-2">
                    <p className="text-xs font-bold text-deep/30 uppercase tracking-wider">{results.length} Properties Found</p>
                  </div>
                  {results.map((p, i) => (
                    <button key={p.id} onClick={() => go(`/property/${p.id}`)}
                      className={clsx('w-full flex items-center gap-3 px-5 py-3 transition-colors text-left',
                        activeIdx === i ? 'bg-terracotta/8' : 'hover:bg-cream'
                      )}>
                      <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center text-xl flex-shrink-0">
                        {p.property_type === 'land' ? '🌿' : p.property_type === 'commercial' ? '🏢' : '🏡'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-deep truncate">{p.title}</p>
                        <div className="flex items-center gap-1 text-xs text-deep/40 mt-0.5">
                          <MapPin size={10} />{p.city}, {p.state}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-display font-black text-sm text-terracotta">{formatPrice(p.price)}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-deep/8 flex items-center gap-4 text-xs text-deep/25">
              <span className="flex items-center gap-1"><kbd className="bg-deep/8 px-1.5 py-0.5 rounded font-mono">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="bg-deep/8 px-1.5 py-0.5 rounded font-mono">↵</kbd> open</span>
              <span className="flex items-center gap-1"><kbd className="bg-deep/8 px-1.5 py-0.5 rounded font-mono">esc</kbd> close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
