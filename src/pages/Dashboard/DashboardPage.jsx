import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Award, Briefcase, Building2, Camera, CheckCircle2, ClipboardList, GraduationCap, HardHat, Heart, Home, Landmark, Plus, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { listMyListings } from '@/modules/listings/listingsService'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [myListingsCount, setMyListingsCount] = useState(0)
  const [myRequestsCount, setMyRequestsCount] = useState(0)
  const [myMatches,       setMyMatches]       = useState(0)
  const [completedDeals,  setCompletedDeals]  = useState(0)
  const [activity,        setActivity]        = useState([]) // combined recent listings + requests
  const [loading,         setLoading]         = useState(true)
  const [becomingProvider, setBecomingProvider] = useState(false)

  useEffect(() => {
    if (!user) return
    loadDashboard()
    const channel = supabase
      .channel('swipes-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'swipes',
        filter: `user_id=eq.${user.id}`
      }, () => loadDashboard())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  const loadDashboard = async () => {
    try {
      const [propListings, catListings, myRequests, matchRes, escrowRes, txRes] = await Promise.all([
        supabase.from('properties').select('id, title, price, status, category, created_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(5),
        listMyListings(supabase, user.id).catch(() => []),
        // Unified view across rental_enquiries / professional_requests / transactions (see 20260813000000_dashboard_profile_spec.sql)
        supabase.from('my_requests').select('request_type, request_id, title, status, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('matches').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('escrow_transactions').select('*', { count: 'exact', head: true }).eq('seller_id', user.id).in('status', ['funded', 'completed']),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('provider_id', user.id).eq('status', 'COMPLETED'),
      ])

      const properties = propListings.data || []
      const categoryListings = catListings || []
      const requests = myRequests.data || []

      setMyListingsCount(properties.length + categoryListings.length)
      setMyRequestsCount(requests.length)

      // Matches: prefer the `matches` table's exact count; fall back to
      // swipes if that RPC/table path errors (same fallback the previous
      // version used, preserved here).
      if (!matchRes.error) {
        setMyMatches(matchRes.count || 0)
      } else {
        const { count: sc } = await supabase.from('swipes').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('action', ['like', 'super'])
        setMyMatches(sc || 0)
      }

      setCompletedDeals((escrowRes.count || 0) + (txRes.count || 0))

      // My Activity: merge recent listings (both kinds) + recent requests
      // into one chronological feed, capped to 6 for the dashboard card.
      const listingActivity = [
        ...properties.map(p => ({ kind: 'listing', id: p.id, title: p.title, sub: `₦${Number(p.price).toLocaleString()} · ${p.category}`, status: p.status, at: p.created_at, link: `/property/${p.id}` })),
        ...categoryListings.map(l => ({ kind: 'listing', id: l.id, title: l.title, sub: l.type, status: l.status, at: l.created_at, link: null })),
      ]
      const requestActivity = requests.map(r => ({ kind: 'request', id: r.request_id, title: r.title, sub: r.request_type, status: r.status, at: r.created_at, link: null }))
      setActivity([...listingActivity, ...requestActivity].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6))
    } catch (err) {
      console.error('loadDashboard error:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const verificationLevel = profile?.is_live_verified ? 'live' : profile?.avatar_url ? 'photo' : 'none'
  const isProvider = !!profile?.offers_services

  // "Become a Provider" is a real, honest toggle (see migration comment):
  // clicking it records intent immediately, then sends the person straight
  // into actual verification -- saying yes never grants provider status by
  // itself, it just starts the real process.
  const handleBecomeProvider = async () => {
    if (!user) return
    setBecomingProvider(true)
    const { error } = await supabase.from('profiles').update({ offers_services: true }).eq('id', user.id)
    setBecomingProvider(false)
    if (error) { toast.error('Could not save. Try again.'); return }
    await refreshProfile()
    toast.success("You're on your way to becoming a provider!")
    navigate('/verify-skill')
  }

  const QUICK_LINKS = [
    { to: '/rentals',       icon: <Building2 size={22} className="text-terracotta" />, label: 'Browse Places',     active: true },
    { to: '/find-provider', icon: <HardHat size={22} className="text-terracotta" />,  label: 'Browse Providers',  active: true },
    { to: '/request',       icon: <ClipboardList size={22} className="text-terracotta" />, label: 'Post a Request', active: true },
    { to: '/matches',       icon: <Heart size={22} className="text-terracotta" />,    label: 'My Matches',        active: true },
    isProvider
      ? { to: '/verify-skill', icon: <Award size={22} className="text-terracotta" />, label: 'My Provider Status', active: true }
      : { to: null, icon: <Briefcase size={22} className="text-terracotta" />, label: 'Become a Provider', active: true, onClick: handleBecomeProvider },
    { to: '/manage-listings', icon: <Home size={22} className="text-terracotta" />,    label: 'My Listings',       active: true },
  ]

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Welcome */}
        <div className="mb-6">
          <h1 className="font-display text-3xl font-black" style={{ color: '#1A1210' }}>
            Hey, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8A7E78' }}>Here's your DealMatch overview</p>
        </div>

        {/* Verification alert */}
        {verificationLevel !== 'live' && (
          <Link to="/verify-identity"
            className="flex items-center gap-3 p-4 rounded-2xl mb-5 border-2"
            style={{ backgroundColor: 'rgba(201,106,58,0.06)', borderColor: 'rgba(201,106,58,0.3)' }}>
            <span>{verificationLevel === 'none' ? <AlertTriangle size={22} className="text-amber-500" /> : <Camera size={22} className="text-terracotta" />}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#1A1210' }}>
                {verificationLevel === 'none' ? 'Complete your verification' : 'Finish Live Verification'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#8A7E78' }}>
                {verificationLevel === 'none'
                  ? 'Upload photo + live check to list and buy properties'
                  : 'Photo uploaded! Complete the live check to unlock full access'}
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: '#C96A3A', color: '#FFFFFF' }}>
              Verify Now <ArrowRight size={12} />
            </div>
          </Link>
        )}

        {/* Primary Action Cards -- the two main entry points, most
            visually prominent items on the page per spec */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link to="/rentals" className="rounded-3xl p-5 flex flex-col justify-between transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: '#1A1210', minHeight: 140 }}>
            <Home size={28} style={{ color: '#C96A3A' }} />
            <div>
              <p className="font-display font-black text-lg text-white leading-tight">Find a Place</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Shortlets, rentals & housing</p>
            </div>
          </Link>
          <Link to="/find-provider" className="rounded-3xl p-5 flex flex-col justify-between transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: '#C96A3A', minHeight: 140 }}>
            <HardHat size={28} className="text-white" />
            <div>
              <p className="font-display font-black text-lg text-white leading-tight">Find a Provider</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Skilled people & services</p>
            </div>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2.5 mb-6">
          {[
            { label: 'My Listings',   value: myListingsCount, link: '/manage-listings' },
            { label: 'My Requests',   value: myRequestsCount, link: '/request' },
            { label: 'Matches',       value: myMatches,       link: '/matches' },
            { label: 'Completed',     value: completedDeals,  link: '/wallet' },
          ].map(s => (
            <Link key={s.label} to={s.link}
              className="rounded-2xl p-3 text-center border transition-all hover:border-[#C96A3A]"
              style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
              <p className="font-display font-black text-xl" style={{ color: '#C96A3A' }}>{loading ? ' - ' : s.value}</p>
              <p className="text-[10px] mt-0.5 leading-tight" style={{ color: '#8A7E78' }}>{s.label}</p>
            </Link>
          ))}
        </div>

        {/* My Activity -- combined recent listings + requests */}
        <div className="rounded-2xl border mb-6" style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
          <div className="p-4 border-b" style={{ borderColor: '#E8DDD2' }}>
            <h3 className="font-display font-black text-base" style={{ color: '#1A1210' }}>My Activity</h3>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C96A3A' }} />
            </div>
          ) : activity.length === 0 ? (
            <div className="p-8 text-center">
              <div className="flex justify-center mb-3"><ClipboardList size={36} className="text-terracotta" /></div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#1A1210' }}>No activity yet</p>
              <p className="text-xs mb-4" style={{ color: '#8A7E78' }}>Post what you need or list what you offer to get started.</p>
              <div className="flex gap-2 justify-center">
                <Link to="/request" className="btn-primary text-sm px-5 py-2.5">Post a Request</Link>
                <Link to="/list" className="px-5 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: '#E8DDD2', color: '#5C4A3A' }}>
                  List What I Offer
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#E8DDD2' }}>
              {activity.map(item => {
                const Wrapper = item.link ? Link : 'div'
                return (
                  <Wrapper key={item.kind + item.id} {...(item.link ? { to: item.link } : {})}
                    className="p-4 flex items-center gap-4 hover:bg-[#F9F5F0] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: '#1A1210' }}>{item.title}</p>
                      <p className="text-xs mt-0.5 capitalize" style={{ color: '#8A7E78' }}>{item.sub}</p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1.5 rounded-full flex-shrink-0 capitalize"
                      style={{
                        backgroundColor: ['active', 'ACTIVE', 'completed', 'COMPLETED'].includes(item.status) ? 'rgba(122,158,126,0.15)' : 'rgba(201,106,58,0.15)',
                        color: ['active', 'ACTIVE', 'completed', 'COMPLETED'].includes(item.status) ? '#5C8060' : '#8A6A20',
                      }}>
                      {item.status?.toLowerCase()}
                    </span>
                  </Wrapper>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {QUICK_LINKS.map(({ to, icon, label, onClick }) => (
            <div key={label}>
              {onClick ? (
                <button onClick={onClick} disabled={becomingProvider}
                  className="w-full flex flex-col items-center justify-center p-4 rounded-3xl border transition-all hover:-translate-y-0.5 disabled:opacity-60"
                  style={{ backgroundColor: 'white', borderColor: '#E8DDD2', minHeight: 90 }}>
                  {icon}
                  <span className="text-xs font-semibold mt-1.5 text-center" style={{ color: '#1A1210' }}>
                    {becomingProvider ? 'Saving…' : label}
                  </span>
                </button>
              ) : (
                <Link to={to} className="flex flex-col items-center justify-center p-4 rounded-3xl border transition-all hover:-translate-y-0.5"
                  style={{ backgroundColor: 'white', borderColor: '#E8DDD2', minHeight: 90 }}>
                  {icon}
                  <span className="text-xs font-semibold mt-1.5 text-center" style={{ color: '#1A1210' }}>{label}</span>
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Coming Soon -- quieter, lower priority, doesn't compete with
            the main actions above */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <GraduationCap size={18} style={{ color: '#B5A99C' }} />, label: 'Student Hostels' },
            { icon: <Landmark size={18} style={{ color: '#B5A99C' }} />,      label: 'Mortgages' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 p-3 rounded-2xl border border-dashed opacity-60"
              style={{ backgroundColor: 'rgba(26,18,16,0.02)', borderColor: '#E8DDD2' }}>
              {icon}
              <span className="text-xs font-medium flex-1" style={{ color: '#8A7E78' }}>{label}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: 'rgba(212,168,83,0.15)', color: '#8A6A20' }}>Coming Soon</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
