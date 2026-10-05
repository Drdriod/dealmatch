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
    <header className="w-full bg-[#F7F4ED]/95 backdrop-blur-md border-b border-deep/10 sticky top-0 z-50">
      <div className="max-w-[1240px] mx-auto px-5 md:px-7 h-[68px] md:h-[78px] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-[#1A1210]">
          <img src="/brand/dealmatch-icon-transparent.png" alt="DealMatch" className="h-7 w-auto" />
          Deal<span className="text-[#C96A3A]">Match</span>
        </Link>

        <nav className="hidden md:flex items-center gap-9 text-sm font-semibold text-[#17211B]">
          <Link to={PLACE_ROUTE} className="hover:text-[#C85F2D]">Find a Place</Link>
          <Link to={PROVIDER_ROUTE} className="hover:text-[#C85F2D]">Find a Provider</Link>
          <Link to={POST_ROUTE} className="hover:text-[#C85F2D]">Post a Request</Link>
        </nav>

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
                {profileOpen && (
                  <div className="absolute right-0 top-8 w-48 bg-[#F7F4ED] border border-[#DEDDD6] rounded-xl shadow-lg py-2 text-sm">
                    <Link to="/dashboard" className="block px-4 py-2 text-[#17211B] hover:text-[#C85F2D]" onClick={() => setProfileOpen(false)}>Dashboard</Link>
                    <Link to="/wallet" className="block px-4 py-2 text-[#17211B] hover:text-[#C85F2D]" onClick={() => setProfileOpen(false)}>My Wallet</Link>
                    <Link to="/manage-listings" className="block px-4 py-2 text-[#17211B] hover:text-[#C85F2D]" onClick={() => setProfileOpen(false)}>Manage Listings</Link>
                    <Link to="/profile" className="block px-4 py-2 text-[#17211B] hover:text-[#C85F2D]" onClick={() => setProfileOpen(false)}>Profile Settings</Link>
                    <button onClick={handleSignOut} className="w-full text-left px-4 py-2 text-[#C85F2D] hover:bg-black/5">Sign Out</button>
                  </div>
                )}
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

          <button className="md:hidden p-2 text-[#17211B]" onClick={() => navigate(PROVIDER_ROUTE)}>
            <Search className="w-5 h-5" />
          </button>

          {user && (
            <div className="md:hidden">
              <NotificationBell />
            </div>
          )}

          <button className="md:hidden p-2 text-[#17211B]" onClick={() => setMobileOpen(!mobileOpen)}>
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
        <div className="md:hidden bg-[#F7F4ED] border-t border-[#DEDDD6] px-4 py-4 space-y-3">
          <Link to={PLACE_ROUTE} className="block text-[#17211B] font-medium py-2" onClick={() => setMobileOpen(false)}>
            Find a Place
          </Link>
          <Link to={PROVIDER_ROUTE} className="block text-[#17211B] font-medium py-2" onClick={() => setMobileOpen(false)}>
            Find a Provider
          </Link>
          <Link to={POST_ROUTE} className="block text-[#17211B] font-medium py-2" onClick={() => setMobileOpen(false)}>
            Post a Request
          </Link>

          <div className="pt-3 border-t border-[#DEDDD6] flex flex-col gap-2">
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
        </div>
      )}
    </header>
  )
}
