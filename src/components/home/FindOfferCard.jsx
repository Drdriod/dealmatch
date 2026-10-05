import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

/**
 * One card, two variants ('looking' | 'offering'). Renders the "What are
 * you here to do?" two-door choice - kept as a single component so both
 * doors always share the exact same visual treatment and motion, rather
 * than risking two hand-written blocks drifting apart over time.
 */
export default function FindOfferCard({ variant, icon: Icon, title, description, ctaLabel, to, onClick }) {
  const content = (
    <motion.div variants={{ rest: { y: 0 }, hover: { y: -4 } }} transition={{ duration: 0.25, ease: 'easeOut' }}>
      <Icon size={26} className="mb-4" style={{ color: variant === 'offering' ? '#FFFFFF' : '#17211B' }} />
      <h3 className="font-display text-3xl mb-2" style={{ color: variant === 'offering' ? '#FFFFFF' : '#17211B' }}>{title}</h3>
      <p className="text-sm mb-5" style={{ color: variant === 'offering' ? 'rgba(255,255,255,0.6)' : '#536058' }}>{description}</p>
      <span className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold"
        style={{ backgroundColor: variant === 'offering' ? '#C85F2D' : '#234C3A', color: '#FFFFFF' }}>
        {ctaLabel}
        <motion.span variants={{ rest: { x: 0 }, hover: { x: 3 } }} transition={{ duration: 0.2 }} className="inline-flex">
          <ArrowRight size={14} />
        </motion.span>
      </span>
    </motion.div>
  )

  const sharedProps = {
    className: 'group relative block w-full text-left rounded-[22px] overflow-hidden p-8 sm:p-10 h-full',
    style: { backgroundColor: variant === 'offering' ? '#234C3A' : '#FFFFFF', border: variant === 'offering' ? 'none' : '1px solid #DEDDD6', minHeight: 200 },
  }

  return (
    <motion.div whileHover="hover" initial="rest" animate="rest">
      {onClick
        ? <button onClick={onClick} {...sharedProps}>{content}</button>
        : <Link to={to} {...sharedProps}>{content}</Link>}
    </motion.div>
  )
}
