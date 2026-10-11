import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ChevronDown, Search } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import NotificationBell from '@/components/ui/NotificationBell'
import { PILLARS, groupHref, isPillarActive, pillarHref } from '@/lib/taxonomy'

const POST_ROUTE = '/request'

const ease = [0.22, 1, 0.36, 1]

function Underline({ id }) {
  return (
    <motion.span
      layoutId={id}
      className="absolute left-0 right-0 -bottom-1 h-0.5 rounded-full bg-[#C85F2D]"
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    />
  )
}

function PillarMenu({ pillar, onNavigate }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      {pillar.groups.map(group => (
        <div key={group.slug}>
          <Link
            to={groupHref(pillar, group)}
            onClick={onNavigate}
            className="block font-bold text-[#17211B] hover:text-[#C85F2D]"
          >
            {group.name}
          </Link>
          {group.children && (
            <ul className="mt-1.5 space-y-1">
              {group.children.map(child => (
                <li key={child.slug}>
                  <Link
                    to={groupHref(pillar, child)}
                    onClick={onNavigate}
                    className="text-[13px] text-[#647068] hover:text-[#C85F2D]"
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <Link
        to={pillarHref(pillar)}
        onClick={onNavigate}
        className="col-span-2 border-t border-[#DEDDD6] pt-3 text-sm font-bold text-[#C85F2D]"
      >
        See all {pillar.name} →
      </Link>
    </div>
  )
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)        // desktop dropdown: pillar slug
  const [mobileSection, setMobileSection] = useState(null) // mobile accordion: pillar slug
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const headerRef = useRef(null)

  // Close everything on route change.
  useEffect(() => {
    setOpenMenu(null)
    setMobileOpen(false)
    setProfileOpen(false)
    setMobileSection(null)
  }, [location.pathname])

  // Escape closes the dropdown; a click outside the header closes it too.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpenMenu(null) }
    const onDown = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) setOpenMenu(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMobileOpen(false)
    setProfileOpen(false)
    navigate('/')
  }

  const postActive = location.pathname === POST_ROUTE

  return (
    <header ref={headerRef} className="w-full bg-[#F7F4ED]/95 backdrop-blur-md border-b border-deep/10 sticky top-0 z-50">
      <div className="max-w-[1240px] mx-auto px-5 md:px-7 h-[68px] md:h-[78px] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-[#1A1210]">
          <img src="/brand/dealmatch-icon-transparent.png" alt="DealMatch" className="h-7 w-auto" />
          Deal<span className="text-[#C96A3A]">Match</span>
        </Link>

        <LayoutGroup id="desktop-nav">
          <nav className="hidden md:flex items-center gap-9 text-sm font-semibold text-[#17211B]">
            {PILLARS.map(pillar => {
              const active = isPillarActive(pillar, location.pathname)
              const open = openMenu === pillar.slug
              return (
                <div key={pillar.slug} className="relative"
                  onMouseEnter={() => setOpenMenu(pillar.slug)}
                  onMouseLeave={() => setOpenMenu(o => (o === pillar.slug ? null : o))}>
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={open}
                    onClick={() => setOpenMenu(o => (o === pillar.slug ? null : pillar.slug))}
                    className={`relative flex items-center gap-1 py-2 hover:text-[#C85F2D] ${active ? 'text-[#C85F2D]' : ''}`}
                  >
                    {pillar.name}
                    <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    {active && <Underline id="nav-underline" />}
                  </button>

                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18, ease }}
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-[540px] rounded-2xl border border-[#DEDDD6] bg-[#F7F4ED] shadow-xl p-5"
                      >
                        <PillarMenu pillar={pillar} onNavigate={() => setOpenMenu(null)} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}

            <Link to={POST_ROUTE} className={`relative py-2 hover:text-[#C85F2D] ${postActive ? 'text-[#C85F2D]' : ''}`}>
              Post a Request
              {postActive && <Underline id="nav-underline" />}
            </Link>
          </nav>
        </LayoutGroup>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="hidden md:block">
                <NotificationBell />
              </div>
              <div className="hidden md:block relative">
                <button onClick={() => setProfileOpen(o => !o)}
                  className="text-sm font-medium text-[#17211B] hover:text-[#C85F2D]">
                  Profile
                </button>
                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease }}
                      className="absolute right-0 top-8 w-48 bg-[#F7F4ED] border border-[#DEDDD6] rounded-xl shadow-lg py-2 text-sm"
                    >
                      <Link to="/dashboard" className="block px-4 py-2 text-[#17211B] hover:text-[#C85F2D]" onClick={() => setProfileOpen(false)}>Dashboard</Link>
                      <Link to="/wallet" className="block px-4 py-2 text-[#17211B] hover:text-[#C85F2D]" onClick={() => setProfileOpen(false)}>My Wallet</Link>
                      <Link to="/manage-listings" className="block px-4 py-2 text-[#17211B] hover:text-[#C85F2D]" onClick={() => setProfileOpen(false)}>Manage Listings</Link>
                      <Link to="/profile" className="block px-4 py-2 text-[#17211B] hover:text-[#C85F2D]" onClick={() => setProfileOpen(false)}>Profile Settings</Link>
                      <button onClick={handleSignOut} className="w-full text-left px-4 py-2 text-[#C85F2D] hover:bg-black/5">Sign Out</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <button onClick={() => navigate('/auth')}
              className="hidden md:block text-sm font-medium text-[#17211B] hover:text-[#C85F2D]">
              Login
            </button>
          )}

          {!user && (
            <button onClick={() => navigate('/auth')}
              className="bg-[#C85F2D] text-white text-[13px] font-bold px-5 py-2.5 rounded-full hover:bg-[#A8441D] hover:-translate-y-px hover:shadow-[0_10px_25px_rgba(200,95,45,0.23)] transition">
              Sign Up
            </button>
          )}

          <button className="md:hidden p-2 text-[#17211B]" aria-label="Search people" onClick={() => navigate('/providers')}>
            <Search className="w-5 h-5" />
          </button>

          {user && (
            <div className="md:hidden">
              <NotificationBell />
            </div>
          )}

          <button className="md:hidden p-2 text-[#17211B]" aria-label="Menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(o => !o)}>
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease }}
            className="md:hidden overflow-hidden bg-[#F7F4ED] border-t border-[#DEDDD6]"
          >
            <div className="px-4 py-4 space-y-1">
              {PILLARS.map(pillar => {
                const open = mobileSection === pillar.slug
                return (
                  <div key={pillar.slug} className="border-b border-[#DEDDD6]/70">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setMobileSection(s => (s === pillar.slug ? null : pillar.slug))}
                      className="w-full flex items-center justify-between py-3 text-left text-[#17211B] font-semibold"
                    >
                      {pillar.name}
                      <ChevronDown size={16} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease }}
                          className="overflow-hidden pb-3"
                        >
                          <PillarMenu pillar={pillar} onNavigate={() => setMobileOpen(false)} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}

              <Link to={POST_ROUTE} className="block text-[#17211B] font-semibold py-3" onClick={() => setMobileOpen(false)}>
                Post a Request
              </Link>
            </div>

            <div className="px-4 pb-4 pt-3 border-t border-[#DEDDD6] flex flex-col gap-2">
              {user ? (
                <>
                  <Link to="/dashboard" className="text-[#17211B] font-medium py-2" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                  <Link to="/wallet" className="text-[#17211B] font-medium py-2" onClick={() => setMobileOpen(false)}>My Wallet</Link>
                  <Link to="/manage-listings" className="text-[#17211B] font-medium py-2" onClick={() => setMobileOpen(false)}>Manage Listings</Link>
                  <Link to="/profile" className="text-[#17211B] font-medium py-2" onClick={() => setMobileOpen(false)}>Profile Settings</Link>
                  <button onClick={handleSignOut} className="w-full text-left text-[#C85F2D] font-medium py-2">
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setMobileOpen(false); navigate('/auth') }} className="w-full text-left text-[#17211B] font-medium py-2">
                    Login
                  </button>
                  <button onClick={() => { setMobileOpen(false); navigate('/auth') }} className="w-full bg-[#C85F2D] text-white font-medium py-2.5 rounded-full">
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
