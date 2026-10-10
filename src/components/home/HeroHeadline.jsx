import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'

// Hero headline with four motion layers:
//   1. Trigger  - words rise out of a mask on load, one after another.
//   2. Rules    - one motion per element, eased, never longer than ~0.9s.
//                 Reduced-motion users get the same text, static.
//   3. Feedback - hovering a word lifts it on a spring; pressing it
//                 settles it back. The accent gets a marker underline.
//   4. Loops    - the marker underline re-draws every few seconds while
//                 the page is idle, and stops while the cursor is on it.

const EASE = [0.22, 1, 0.36, 1]
const SPRING = { type: 'spring', stiffness: 380, damping: 22, mass: 0.6 }

const LINE_ONE = ['Find', 'what', 'you', 'need.']
const LINE_TWO = ['Find', 'who', 'can']
const ACCENT = ['provide', 'it.']

function Word({ children, index, reduce, className = '', accent = false }) {
  return (
    <span className={`inline-block overflow-hidden align-bottom ${className}`}>
      <motion.span
        className={`inline-block will-change-transform ${accent ? 'text-terracotta italic' : ''}`}
        initial={reduce ? false : { y: '110%', opacity: 0 }}
        animate={{ y: '0%', opacity: 1 }}
        transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : 0.07 * index }}
        whileHover={reduce ? undefined : { y: -4, rotate: -1.5, transition: SPRING }}
        whileTap={reduce ? undefined : { scale: 0.96, transition: SPRING }}
      >
        {children}
      </motion.span>
    </span>
  )
}

export default function HeroHeadline() {
  const reduce = useReducedMotion()
  const [hovering, setHovering] = React.useState(false)
  const lineOneCount = LINE_ONE.length
  const lineTwoStart = lineOneCount
  const accentStart = lineTwoStart + LINE_TWO.length

  return (
    <h1 className="font-headline mt-4 text-[clamp(40px,11vw,54px)] sm:text-[clamp(52px,5vw,80px)] leading-[0.98] tracking-[-0.02em] max-w-[760px] text-deep">
      <span className="block">
        {LINE_ONE.map((w, i) => (
          <React.Fragment key={w + i}>
            <Word index={i} reduce={reduce}>{w}</Word>
            {i < LINE_ONE.length - 1 ? ' ' : null}
          </React.Fragment>
        ))}
      </span>
      <span className="block">
        {LINE_TWO.map((w, i) => (
          <React.Fragment key={w + i}>
            <Word index={lineTwoStart + i} reduce={reduce}>{w}</Word>
            {' '}
          </React.Fragment>
        ))}
        <span
          className="relative inline-block whitespace-nowrap"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {ACCENT.map((w, i) => (
            <React.Fragment key={w + i}>
              <Word index={accentStart + i} reduce={reduce} accent>{w}</Word>
              {i < ACCENT.length - 1 ? ' ' : null}
            </React.Fragment>
          ))}
          {/* Marker underline: draws in once, then loops while idle */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 -bottom-[0.12em] w-full h-[0.32em] overflow-visible"
            viewBox="0 0 200 14"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M2 9 C 40 3, 90 13, 130 6 S 186 4, 198 8"
              fill="none"
              stroke="#F3C96A"
              strokeWidth="7"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={
                reduce
                  ? { pathLength: 1 }
                  : hovering
                    ? { pathLength: 1 }
                    : { pathLength: [0, 1, 1], opacity: [1, 1, 1] }
              }
              transition={
                reduce
                  ? { duration: 0 }
                  : hovering
                    ? { duration: 0.4, ease: EASE, delay: 0.9 }
                    : { duration: 0.9, ease: EASE, delay: 0.9, times: [0, 0.6, 1], repeat: Infinity, repeatDelay: 3.5 }
              }
            />
          </svg>
        </span>
      </span>
    </h1>
  )
}
