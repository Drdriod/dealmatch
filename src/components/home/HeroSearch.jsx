import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Search } from 'lucide-react'

// Only things DealMatch actually supports today - Places (shortlet/house
// rent) and People (skilled services). Never list a category that doesn't
// exist yet (cars, land, logistics, etc per the brief's explicit "do not
// add" list).
const EXAMPLES = [
  'Find a shortlet in Uyo',
  'Find a plumber',
  'Find house rent',
  'Find a home lesson teacher',
  'Find an electrician',
  'Find a cleaner',
]

export default function HeroSearch({ className = '' }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [exampleIdx, setExampleIdx] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setExampleIdx(i => (i + 1) % EXAMPLES.length), 2600)
    return () => clearInterval(t)
  }, [])

  // FIX (item 7-a of the trace): this used to keyword-guess whether the
  // text was about a "place" or a "person" client-side and route straight
  // to /places or /providers - no real search ever ran, and the guess was
  // often wrong (e.g. "shortlet with a cleaner included"). Now it always
  // routes to the universal search page, which runs the real
  // universal_search() federated query plus AI/location matching across
  // every category, and lets the results speak for themselves instead of
  // a client-side guess deciding which single vertical to show.
  const submit = (e) => {
    e.preventDefault()
    const text = value.trim()
    navigate(text ? `/search?q=${encodeURIComponent(text)}` : '/search')
  }

  return (
    <form onSubmit={submit} className={`relative w-full max-w-[700px] ${className}`}>
      <div className="relative flex items-center rounded-[20px] p-1.5 shadow-soft transition-shadow focus-within:ring-2 focus-within:ring-terracotta/30"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(23,33,27,0.08)' }}>
        <Search size={18} className="ml-5 flex-shrink-0" style={{ color: '#647068' }} />

        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            aria-label="What are you looking for?"
            className="w-full bg-transparent outline-none px-3 py-4 text-sm sm:text-base"
            style={{ color: '#17211B' }}
          />
          {value === '' && (
            <div className="absolute inset-0 flex items-center px-3 pointer-events-none overflow-hidden">
              {reducedMotion ? (
                <span className="text-sm sm:text-base truncate" style={{ color: '#A89A8C' }}>{EXAMPLES[exampleIdx]}</span>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={exampleIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className="text-sm sm:text-base truncate"
                    style={{ color: '#A89A8C' }}
                  >
                    {EXAMPLES[exampleIdx]}
                  </motion.span>
                </AnimatePresence>
              )}
            </div>
          )}
        </div>

        <button type="submit"
          className="flex-shrink-0 flex items-center gap-1.5 px-4 sm:px-6 min-h-[52px] rounded-full text-sm font-bold transition hover:-translate-y-px hover:shadow-[0_10px_25px_rgba(200,95,45,0.23)]"
          style={{ backgroundColor: '#C85F2D', color: '#FFFFFF' }}>
          Find a Match <ArrowRight size={14} />
        </button>
      </div>
    </form>
  )
}
