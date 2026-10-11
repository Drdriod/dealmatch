import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * A single native horizontally-scrollable, scroll-snapping track. Desktop
 * arrows call scrollBy on the exact same element mobile touch-scrolls, so
 * there's one source of truth for position - no separate "desktop mode"
 * logic to keep in sync with "mobile mode" logic.
 *
 * Deliberately not the existing Carousel.jsx (which pages through fixed
 * groups with a motion slide, and autoplays by default) - the brief
 * asks specifically for a snap-scroll rail with a peeking next card and no
 * autoplay, which native overflow-scroll + scroll-snap gives for free and
 * with genuinely better mobile feel than a JS-driven transform ever will.
 */
export default function Rail({ children }) {
  const trackRef = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const updateArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    updateArrows()
    const el = trackRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('resize', updateArrows)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
    }
  }, [updateArrows, children])

  const scrollByCard = (dir) => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector('[data-rail-card]')
    const step = (card?.offsetWidth || 260) + 16
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto pb-1 -mx-6 px-6 sm:mx-0 sm:px-0"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
      >
        {React.Children.map(children, (child) => (
          <div data-rail-card style={{ scrollSnapAlign: 'start' }}>{child}</div>
        ))}
      </div>

      {/* Arrows: desktop only (hidden on touch-primary viewports where the
          native swipe already does the job) */}
      {canPrev && (
        <button onClick={() => scrollByCard(-1)} aria-label="Previous"
          className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center shadow-md"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6', color: '#17211B' }}>
          <ChevronLeft size={16} />
        </button>
      )}
      {canNext && (
        <button onClick={() => scrollByCard(1)} aria-label="Next"
          className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center shadow-md"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6', color: '#17211B' }}>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}
