import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * A small, dependency-light carousel: groups `items` into pages of
 * `perPage` and animates between pages with a horizontal slide + fade.
 * Auto-advances on a timer, pauses while the pointer is over it, and
 * exposes prev/next arrows + dot indicators. Renders each item via
 * `renderItem` so callers keep full control of card markup/copy - this
 * component only owns the motion and pagination, never the content.
 */
export default function Carousel({ items, renderItem, perPage = 3, autoPlayMs = 4500, gap = 16 }) {
  const [page, setPage] = useState(0)
  const [paused, setPaused] = useState(false)
  const [direction, setDirection] = useState(1)
  const [viewportPerPage, setViewportPerPage] = useState(perPage)
  const timerRef = useRef(null)

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth
      if (w < 640) setViewportPerPage(1)
      else if (w < 1024) setViewportPerPage(Math.min(2, perPage))
      else setViewportPerPage(perPage)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [perPage])

  const pages = useMemo(() => {
    const out = []
    for (let i = 0; i < items.length; i += viewportPerPage) out.push(items.slice(i, i + viewportPerPage))
    return out
  }, [items, viewportPerPage])

  const pageCount = pages.length

  useEffect(() => {
    if (paused || pageCount <= 1) return
    timerRef.current = setInterval(() => {
      setDirection(1)
      setPage(p => (p + 1) % pageCount)
    }, autoPlayMs)
    return () => clearInterval(timerRef.current)
  }, [paused, pageCount, autoPlayMs])

  // Clamp page if the underlying item count shrinks (e.g. filters change)
  useEffect(() => { if (page >= pageCount) setPage(0) }, [pageCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (i) => { setDirection(i > page ? 1 : -1); setPage(i) }
  const prev = () => goTo((page - 1 + pageCount) % pageCount)
  const next = () => goTo((page + 1) % pageCount)

  if (!items.length) return null

  const variants = {
    enter: (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={page}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            drag={pageCount > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) next()
              else if (info.offset.x > 60) prev()
            }}
            className="flex"
            style={{ gap }}
          >
            {pages[page]?.map(item => (
              <div key={item.key} className="flex-1 min-w-0">
                {renderItem(item)}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button onClick={prev} aria-label="Previous"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6', color: '#17211B' }}>
            <ChevronLeft size={15} />
          </button>
          <div className="flex items-center gap-1.5">
            {pages.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} aria-label={`Go to page ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width: i === page ? 18 : 6, height: 6,
                  backgroundColor: i === page ? '#C85F2D' : '#DEDDD6',
                }} />
            ))}
          </div>
          <button onClick={next} aria-label="Next"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6', color: '#17211B' }}>
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
