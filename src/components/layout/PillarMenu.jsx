import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import useCategoryTree from '@/hooks/useCategoryTree'
import { categoryHref } from '@/lib/taxonomy'

const ease = [0.22, 1, 0.36, 1]
// Short intent delays: the panel does not flicker when the pointer crosses
// the navbar, and it stays open while the pointer moves down into it.
const OPEN_DELAY = 90
const CLOSE_DELAY = 180

const VIEW_ALL = { place: 'Browse all places', people: 'Browse all people' }

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease } },
}

// The active groups for one pillar, read from the database `pillar` column.
// Sorted by name so the order is stable and does not depend on the seed.
function groupsFor(pillarSlug, tree) {
  if (!tree) return null
  return tree
    .filter(root => root.pillar === pillarSlug)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function MenuStatus({ tree, error, groups }) {
  if (error) {
    return <p role="status" className="text-sm text-[#647068]">Categories are unavailable right now. Please try again shortly.</p>
  }
  if (!tree) {
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-4" aria-hidden="true">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="space-y-2 animate-pulse">
            <div className="h-3.5 w-2/3 rounded bg-[#EFE6D8]" />
            <div className="h-3 w-1/2 rounded bg-[#EFE6D8]" />
          </div>
        ))}
      </div>
    )
  }
  if (groups.length === 0) {
    return <p role="status" className="text-sm text-[#647068]">Groups for this section are being set up. Check back soon.</p>
  }
  return null
}

// Desktop: hover (with intent delay) or keyboard (ArrowDown opens, Escape
// closes and returns focus to the pillar link).
function DesktopPillar({ pillar, active }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(null)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const openTimer = useRef(null)
  const closeTimer = useRef(null)
  const focusFirst = useRef(false)
  const location = useLocation()
  const { tree, error } = useCategoryTree()
  const groups = groupsFor(pillar.slug, tree) || []
  const panelId = `pillar-menu-${pillar.slug}`

  const clearTimers = () => {
    clearTimeout(openTimer.current)
    clearTimeout(closeTimer.current)
  }
  const show = () => {
    clearTimers()
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY)
  }
  const hide = () => {
    clearTimers()
    closeTimer.current = setTimeout(() => { setOpen(false); setHovered(null) }, CLOSE_DELAY)
  }
  const hideNow = () => {
    clearTimers()
    setOpen(false)
    setHovered(null)
  }

  // Close when the route changes, and clear timers on unmount.
  useEffect(() => { hideNow() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => clearTimers, [])

  // Keyboard ArrowDown opens the panel and moves focus into it.
  useEffect(() => {
    if (open && focusFirst.current) {
      focusFirst.current = false
      wrapRef.current?.querySelector('[data-pillar-item]')?.focus()
    }
  }, [open])

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      hideNow()
      triggerRef.current?.focus()
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerEnter={e => { if (e.pointerType === 'mouse') show() }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') hide() }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) hideNow() }}
      onKeyDown={onKeyDown}
    >
      <Link
        ref={triggerRef}
        to={pillar.route}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            focusFirst.current = true
            clearTimers()
            setOpen(true)
          }
        }}
        className={`relative inline-flex items-center gap-1 py-2 hover:text-[#C85F2D] ${active ? 'text-[#C85F2D]' : ''}`}
      >
        {pillar.name}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease }}
          className="inline-flex"
          aria-hidden="true"
        >
          <ChevronDown size={14} strokeWidth={2.5} />
        </motion.span>
        {active && (
          <motion.span
            layoutId="nav-underline"
            className="absolute left-0 right-0 -bottom-1 h-0.5 rounded-full bg-[#C85F2D]"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
      </Link>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            id={panelId}
            initial={{ opacity: 0, x: '-50%', y: -8, scale: 0.98 }}
            animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease }}
            className="absolute top-full left-1/2 z-50 origin-top pt-3"
            onPointerEnter={clearTimers}
          >
            <nav
              aria-label={`${pillar.name} categories`}
              className="w-[min(680px,92vw)] rounded-2xl border border-[#DEDDD6] bg-[#FFFDF8] p-5 shadow-[0_24px_60px_-20px_rgba(23,33,27,0.28)]"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#647068]">{pillar.name}</p>
                <Link to={pillar.route} onClick={hideNow}
                  className="text-xs font-semibold text-[#C85F2D] hover:text-[#A8441D]">
                  {VIEW_ALL[pillar.slug]} →
                </Link>
              </div>

              {(!tree || error || groups.length === 0) ? (
                <MenuStatus tree={tree} error={error} groups={groups} />
              ) : (
                <motion.div variants={listVariants} initial="hidden" animate="show"
                  className="grid grid-cols-2 gap-x-6 gap-y-5">
                  {groups.map(group => (
                    <motion.div key={group.id} variants={itemVariants}>
                      <Link to={categoryHref(group.slug)} onClick={hideNow} data-pillar-item
                        className="text-sm font-bold text-[#17211B] hover:text-[#C85F2D] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C85F2D] rounded">
                        {group.name}
                      </Link>
                      {group.children?.length > 0 && (
                        <ul className="mt-2 space-y-0.5" onMouseLeave={() => setHovered(null)}>
                          {group.children.map(child => (
                            <li key={child.id}>
                              <Link to={categoryHref(child.slug)} onClick={hideNow}
                                data-pillar-item
                                onMouseEnter={() => setHovered(child.id)}
                                onFocus={() => setHovered(child.id)}
                                onBlur={() => setHovered(null)}
                                className="relative block rounded-lg px-2 py-1.5 text-[13px] text-[#3A4740] hover:text-[#17211B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C85F2D]">
                                {hovered === child.id && (
                                  <motion.span
                                    layoutId={`pillar-hover-${pillar.slug}`}
                                    className="absolute inset-0 rounded-lg bg-[#C85F2D]/10"
                                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                  />
                                )}
                                <span className="relative">{child.name}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Mobile: the pillar link plus a disclosure button that expands its groups.
function MobilePillar({ pillar, active, onNavigate }) {
  const [open, setOpen] = useState(false)
  const { tree, error } = useCategoryTree()
  const groups = groupsFor(pillar.slug, tree) || []

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link to={pillar.route} onClick={onNavigate}
          className={`block flex-1 py-3 font-semibold ${active ? 'text-[#C85F2D]' : 'text-[#17211B]'}`}>
          {pillar.name}
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Show ${pillar.name} categories`}
          onClick={() => setOpen(o => !o)}
          className="p-2 text-[#17211B]"
        >
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease }} className="inline-flex">
            <ChevronDown size={18} />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="groups"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease }}
            className="overflow-hidden"
          >
            <div className="mb-2 ml-1 space-y-4 border-l-2 border-[#C85F2D]/30 pb-3 pl-4">
              <MenuStatus tree={tree} error={error} groups={groups} />
              {tree && !error && groups.map(group => (
                <div key={group.id}>
                  <Link to={categoryHref(group.slug)} onClick={onNavigate}
                    className="block py-1.5 text-sm font-bold text-[#17211B]">
                    {group.name}
                  </Link>
                  {group.children?.map(child => (
                    <Link key={child.id} to={categoryHref(child.slug)} onClick={onNavigate}
                      className="block py-1.5 pl-3 text-sm text-[#3A4740]">
                      {child.name}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * A top-level navigation pillar (Place or People). Desktop shows an animated
 * category dropdown on hover or keyboard. Mobile shows an expandable list.
 */
export default function PillarMenu({ pillar, active = false, variant = 'desktop', onNavigate = () => {} }) {
  if (variant === 'mobile') {
    return <MobilePillar pillar={pillar} active={active} onNavigate={onNavigate} />
  }
  return <DesktopPillar pillar={pillar} active={active} />
}
