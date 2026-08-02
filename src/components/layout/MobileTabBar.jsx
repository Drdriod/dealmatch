import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, Compass, PlusCircle, MessageCircle, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

const TABS = [
  { to: '/',            label: 'Home',     icon: Home },
  { to: '/marketplace',  label: 'Explore',  icon: Compass },
  { to: '/marketplace',  label: 'Post',     icon: PlusCircle, authOnly: true },
  { to: '/messages',     label: 'Messages', icon: MessageCircle, authOnly: true },
  { to: '/profile',      label: 'Profile',  icon: User, authOnly: true },
]

/**
 * Bottom tab bar for mobile, matching the UI/UX concept review's Screen 01
 * (Home, Explore, Post, Messages, Profile). Hidden at md breakpoint and up,
 * where the top Navbar already covers the same five jobs. Unauthenticated
 * visitors get Home and Explore only, plus a single "Sign In" tab, rather
 * than tabs that would just bounce them to /auth.
 */
export default function MobileTabBar() {
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  const tabs = isAuthenticated
    ? TABS
    : [
        TABS[0],
        TABS[1],
        { to: '/auth', label: 'Sign In', icon: User },
      ]

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
      style={{
        backgroundColor: '#FFFAF5',
        borderTop: '1px solid #E8DDD2',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {tabs.map(tab => {
        const active = tab.to === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.to)
        const Icon = tab.icon
        return (
          <Link
            key={tab.label}
            to={tab.to}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
            style={{ color: active ? '#C96A3A' : '#8A7E78' }}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            <span className="text-[10px] font-semibold">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
