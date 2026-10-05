import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Home, Users, Plus, Inbox, User, X, Building2, Award, ClipboardList } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AnimatePresence, motion } from 'framer-motion'

const SIDE_TABS = [
  { to: '/places',    label: 'Places', icon: Home },
  { to: '/providers',  label: 'People', icon: Users },
]

const GUEST_TABS = [
  { to: '/places',    label: 'Places', icon: Home },
  { to: '/providers',  label: 'People', icon: Users },
]

const POST_CHOICES = [
  { to: '/list-rental',    label: 'List a place',   desc: 'Shortlet or house rent, Places',       icon: Building2 },
  { to: '/verify-skill',   label: 'Offer a skill',  desc: 'Artisan, tutor, home service, People',  icon: Award },
  { to: '/request',        label: 'I need someone', desc: 'Post a request, phone stays hidden',    icon: ClipboardList },
]

/**
 * Bottom tab bar for mobile - Places / People / Post / Inbox / Profile, per
 * the mobile UI spec. Post sits centre + raised as the primary action and
 * opens a chooser (List a place / Offer a skill / I need someone) instead
 * of linking anywhere directly, since it maps to three different flows.
 * Same terracotta styling as the previous Home/Explore/Post/Messages/
 * Profile bar this replaces. Desktop nav is untouched - this is md:hidden.
 *
 * Inbox intentionally carries no unread-count badge here: chats stay
 * locked/empty-looking until escrow unlocks them (see MessagesPage), so a
 * loud badge on a tab that's usually empty would be misleading rather than
 * useful.
 */
export default function MobileTabBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [showChooser, setShowChooser] = useState(false)

  const isActive = (to) => location.pathname === to || location.pathname.startsWith(to + '/')

  const goTo = (to) => { setShowChooser(false); navigate(to) }

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          backgroundColor: '#F7F4ED',
          borderTop: '1px solid #DEDDD6',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {(isAuthenticated ? SIDE_TABS : GUEST_TABS).slice(0, 2).map(tab => {
          const active = isActive(tab.to)
          const Icon = tab.icon
          return (
            <Link key={tab.label} to={tab.to}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
              style={{ color: active ? '#C85F2D' : '#647068' }}>
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </Link>
          )
        })}

        {/* Post - centre + raised primary action */}
        <div className="flex-1 flex items-center justify-center relative" style={{ minWidth: 0 }}>
          <button
            onClick={() => isAuthenticated ? setShowChooser(true) : navigate('/auth')}
            aria-label="Post"
            className="absolute flex items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
            style={{
              width: 52, height: 52, top: -20,
              backgroundColor: '#C85F2D', color: '#FFFFFF',
              border: '4px solid #F7F4ED',
            }}>
            <Plus size={24} strokeWidth={2.5} />
          </button>
          <span className="text-[10px] font-semibold mt-7" style={{ color: '#647068' }}>Post</span>
        </div>

        {isAuthenticated ? (
          <>
            <Link to="/messages"
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
              style={{ color: isActive('/messages') ? '#C85F2D' : '#647068' }}>
              <Inbox size={20} strokeWidth={isActive('/messages') ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">Inbox</span>
            </Link>
            <Link to="/profile"
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
              style={{ color: isActive('/profile') ? '#C85F2D' : '#647068' }}>
              <User size={20} strokeWidth={isActive('/profile') ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">Profile</span>
            </Link>
          </>
        ) : (
          <Link to="/auth"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
            style={{ color: isActive('/auth') ? '#C85F2D' : '#647068' }}>
            <User size={20} strokeWidth={isActive('/auth') ? 2.5 : 2} />
            <span className="text-[10px] font-semibold">Sign In</span>
          </Link>
        )}
      </nav>

      {/* Post chooser - bottom sheet */}
      <AnimatePresence>
        {showChooser && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowChooser(false)}
              className="md:hidden fixed inset-0 z-[60]" style={{ backgroundColor: 'rgba(23,33,27,0.45)' }} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
              className="md:hidden fixed left-0 right-0 bottom-0 z-[61] rounded-t-3xl px-5 pt-4"
              style={{
                backgroundColor: '#FFFFFF',
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
              }}>
              <div className="flex items-center justify-between mb-4">
                <span className="font-display font-black text-base" style={{ color: '#17211B' }}>What do you want to post?</span>
                <button onClick={() => setShowChooser(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F0E5D8' }}>
                  <X size={15} style={{ color: '#17211B' }} />
                </button>
              </div>
              <div className="space-y-2.5">
                {POST_CHOICES.map(choice => {
                  const Icon = choice.icon
                  return (
                    <button key={choice.to} onClick={() => goTo(choice.to)}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left"
                      style={{ backgroundColor: '#F7F4ED', border: '1px solid #DEDDD6' }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
                        <Icon size={18} style={{ color: '#C85F2D' }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: '#17211B' }}>{choice.label}</p>
                        <p className="text-xs" style={{ color: '#647068' }}>{choice.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
