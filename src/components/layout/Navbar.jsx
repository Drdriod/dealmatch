import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import NotificationBell from '@/components/ui/NotificationBell'

// Routes referenced below (/find-place, /find-provider, /post-job) --
// /post-job and /provider/:id -> /find-provider are confirmed against
// JobPostingPage.jsx and ProviderSearchPage.jsx. /find-place is a new
// name introduced in this file; if your property browse page is mounted
// at a different path, update PLACE_ROUTE below rather than the many
// places it'd otherwise need changing.
const PLACE_ROUTE    = '/places'
const PROVIDER_ROUTE = '/providers'
const POST_ROUTE     = '/request'

export default function Navbar() {
  const [mobileOpen, setMobileOpen]   = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMobileOpen(false)
    setProfileOpen(false)
    navigate('/')
  }

  return (
    <header className="w-full bg-[#FAF6F0] border-b border-[#E8DDD2] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-[#1A1210]">
          <img src="/brand/dealmatch-icon-transparent.png" alt="DealMatch" className="h-7 w-auto" />
          Deal<span className="text-[#C96A3A]">Match</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#1A1210]">
          <Link to={PLACE_ROUTE} className="hover:text-[#C96A3A]">Find a Place</Link>
          <Link to={PROVIDER_ROUTE} className="hover:text-[#C96A3A]">Find a Provider</Link>
          <Link to={POST_ROUTE} className="hover:text-[#C96A3A]">Post a Request</Link>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="hidden md:block">
                <NotificationBell />
              </div>
              <div className="hidden md:block relative">
                <button onClick={() => setProfileOpen(o => !o)}
                  className="text-sm font-medium text-[#1A1210] hover:text-[#C96A3A]">
                  Profile
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-8 w-48 bg-[#FAF6F0] border border-[#E8DDD2] rounded-xl shadow-lg py-2 text-sm">
                    <Link to="/dashboard" className="block px-4 py-2 text-[#1A1210] hover:text-[#C96A3A]" onClick={() => setProfileOpen(false)}>Dashboard</Link>
                    <Link to="/wallet" className="block px-4 py-2 text-[#1A1210] hover:text-[#C96A3A]" onClick={() => setProfileOpen(false)}>My Wallet</Link>
                    <Link to="/manage-listings" className="block px-4 py-2 text-[#1A1210] hover:text-[#C96A3A]" onClick={() => setProfileOpen(false)}>Manage Listings</Link>
                    <Link to="/profile" className="block px-4 py-2 text-[#1A1210] hover:text-[#C96A3A]" onClick={() => setProfileOpen(false)}>Profile Settings</Link>
                    <button onClick={handleSignOut} className="w-full text-left px-4 py-2 text-[#C96A3A] hover:bg-black/5">Sign Out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={() => navigate('/auth')}
              className="hidden md:block text-sm font-medium text-[#1A1210] hover:text-[#C96A3A]">
              Login
            </button>
          )}

          {!user && (
            <button onClick={() => navigate('/auth')}
              className="bg-[#C96A3A] text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-[#B15A2E] transition">
              Sign Up
            </button>
          )}

          <button className="md:hidden p-2 text-[#1A1210]" onClick={() => navigate(PROVIDER_ROUTE)}>
            <Search className="w-5 h-5" />
          </button>

          {user && (
            <div className="md:hidden">
              <NotificationBell />
            </div>
          )}

          <button className="md:hidden p-2 text-[#1A1210]" onClick={() => setMobileOpen(!mobileOpen)}>
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

      {mobileOpen && (
        <div className="md:hidden bg-[#FAF6F0] border-t border-[#E8DDD2] px-4 py-4 space-y-3">
          <Link to={PLACE_ROUTE} className="block text-[#1A1210] font-medium py-2" onClick={() => setMobileOpen(false)}>
            Find a Place
          </Link>
          <Link to={PROVIDER_ROUTE} className="block text-[#1A1210] font-medium py-2" onClick={() => setMobileOpen(false)}>
            Find a Provider
          </Link>
          <Link to={POST_ROUTE} className="block text-[#1A1210] font-medium py-2" onClick={() => setMobileOpen(false)}>
            Post a Request
          </Link>

          <div className="pt-3 border-t border-[#E8DDD2] flex flex-col gap-2">
            {user ? (
              <>
                <Link to="/dashboard" className="text-[#1A1210] font-medium py-2" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                <Link to="/wallet" className="text-[#1A1210] font-medium py-2" onClick={() => setMobileOpen(false)}>My Wallet</Link>
                <Link to="/manage-listings" className="text-[#1A1210] font-medium py-2" onClick={() => setMobileOpen(false)}>Manage Listings</Link>
                <Link to="/profile" className="text-[#1A1210] font-medium py-2" onClick={() => setMobileOpen(false)}>Profile Settings</Link>
                <button onClick={handleSignOut} className="w-full text-left text-[#C96A3A] font-medium py-2">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setMobileOpen(false); navigate('/auth') }} className="w-full text-left text-[#1A1210] font-medium py-2">
                  Login
                </button>
                <button onClick={() => { setMobileOpen(false); navigate('/auth') }} className="w-full bg-[#C96A3A] text-white font-medium py-2.5 rounded-full">
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
