import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, ListChecks, MousePointerClick, Handshake } from 'lucide-react'
import Rail from './Rail'

// 4 steps, matching the approved copy. Each `back` line stays generic on
// purpose (search OR post, browse OR receive bids, book OR bid OR escrow)
// since this section describes the shape of every flow on the platform,
// not one specific vertical.
const STEPS = [
  { n: '01', icon: Search,            title: 'Tell us', back: "Search for a place or service, or post exactly what you're looking for." },
  { n: '02', icon: ListChecks,        title: 'Options', back: 'Browse available places or providers, or let providers respond to your request.' },
  { n: '03', icon: MousePointerClick, title: 'Choose',  back: 'Book directly, receive bids, or continue through the available transaction flow.' },
  { n: '04', icon: Handshake,         title: 'Done',    back: 'Connect, complete the transaction and move forward.' },
]

const CARD_W = 260
const CARD_H = 320

function FlipCard({ step, flipped }) {
  const Icon = step.icon
  return (
    <div className="flex-shrink-0" style={{ width: CARD_W, height: CARD_H, perspective: 1400 }}>
      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.7, ease: [0.45, 0.05, 0.15, 0.95] }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-3xl p-7 flex flex-col justify-between"
          style={{ backfaceVisibility: 'hidden', backgroundColor: '#FFFFFF', border: '1px solid #E9DECF' }}
        >
          <span className="font-display text-2xl font-black" style={{ color: '#E4D2BF' }}>{step.n}</span>
          <div>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#C45C26' }}>
              <Icon size={28} color="#FFFFFF" strokeWidth={2} />
            </div>
            <h3 className="font-display text-2xl font-black" style={{ color: '#1A1A1A' }}>{step.title}</h3>
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-3xl p-7 flex flex-col justify-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', backgroundColor: '#1A1A1A' }}
        >
          <span className="font-display text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#C45C26' }}>
            Step {step.n}
          </span>
          <p className="font-display text-lg font-bold leading-snug" style={{ color: '#FFFFFF' }}>{step.back}</p>
        </div>
      </motion.div>
    </div>
  )
}

/**
 * "How DealMatch Works", 4 steps (Tell us / Options / Choose / Done), each
 * a flip card. Auto-flip only, on a background timer that cycles through
 * the cards one at a time, front to back and back to front, with no tap
 * or click interaction on the cards themselves. (An earlier pass of this
 * component added tap-to-flip; that was reverted per direct instruction,
 * this version is auto-only again.)
 */
export default function HowItWorksFlip() {
  const [activeIndex, setActiveIndex] = useState(-1) // -1 = no card flipped right now
  const [reducedMotion, setReducedMotion] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    if (reducedMotion) return // no autoplay loop for reduced-motion users
    let step = 0
    const tick = () => {
      setActiveIndex(step)
      timerRef.current = setTimeout(() => {
        setActiveIndex(-1)
        step = (step + 1) % STEPS.length
        timerRef.current = setTimeout(tick, 500)
      }, 2200)
    }
    timerRef.current = setTimeout(tick, 900)
    return () => clearTimeout(timerRef.current)
  }, [reducedMotion])

  return (
    <section className="py-16 px-6" style={{ backgroundColor: '#F8F1E9' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#C45C26' }}>How it works</p>
          <h2 className="font-display text-2xl sm:text-3xl font-black" style={{ color: '#1A1A1A' }}>Four steps, start to finish.</h2>
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-4xl">
            <Rail>
              {STEPS.map((step, i) => (
                <FlipCard key={step.title} step={step} flipped={activeIndex === i} />
              ))}
            </Rail>
          </div>
        </div>
      </div>
    </section>
  )
}
