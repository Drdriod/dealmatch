import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Camera, ClipboardList, GraduationCap, HardHat, Heart, Home, Landmark, Plus, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const [myListings, setMyListings] = useState([])
  const [myMatches,  setMyMatches]  = useState(0)
  const [loading,    setLoading]    = useState(true)

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
      const { data: listings } = await supabase
        .from('properties')
        .select('id, title, price, status, category, created_at')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)
      setMyListings(listings || [])

      let matchCount = 0
      const { count: mc, error: matchErr } = await supabase
        .from('matches').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
      if (!matchErr) { matchCount = mc || 0 } else {
        const { count: sc } = await supabase
          .from('swipes').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).in('action', ['like', 'super'])
        matchCount = sc || 0
      }
      setMyMatches(matchCount)
    } catch (err) {
      console.error('loadDashboard error:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const verificationLevel = profile?.is_live_verified ? 'live' : profile?.avatar_url ? 'photo' : 'none'

  const QUICK_LINKS = [
    { to: '/browse',        icon: <Home size={24} className="text-terracotta" />,            label: 'Browse Properties', active: true  },
    { to: '/matches',       icon: <Heart size={24} className="text-terracotta" />,           label: 'My Matches',        active: true  },
    { to: '/list',          icon: <ClipboardList size={24} className="text-terracotta" />,   label: 'List Property',     active: true  },
    { to: '/professionals', icon: <HardHat size={24} className="text-terracotta" />,         label: 'Professionals',     active: true  },
    { to: null,             icon: <GraduationCap size={24} className="text-muted" />,        label: 'Student Hostels',   active: false, comingSoon: true  },
    { to: null,             icon: <Landmark size={24} className="text-muted" />,             label: 'Mortgages',         active: false, comingSoon: true  },
  ]

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Welcome */}
        <div className="mb-6">
          <h1 className="font-display text-3xl font-black" style={{ color: '#1A1210' }}>
            Hey, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8A7E78' }}>Here's your DealMatch dashboard</p>
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ backgroundColor: '#C96A3A', color: '#FFFFFF' }}>
              Verify Now <ArrowRight size={12} />
            </div>
          </Link>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { label: 'My Listings', value: myListings.length, icon: <Home size={24} className="text-terracotta" />, link: '/list'    },
            { label: 'Matches',     value: myMatches,          icon: <Heart size={24} className="text-terracotta" />,  link: '/matches' },
          ].map(s => (
            <Link key={s.label} to={s.link}
              className="rounded-2xl p-4 text-center border transition-all hover:border-[#C96A3A]"
              style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
              <div className="flex justify-center mb-1">{s.icon}</div>
              <p className="font-display font-black text-2xl" style={{ color: '#C96A3A' }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8A7E78' }}>{s.label}</p>
            </Link>
          ))}
        </div>

        {/* My Listings */}
        <div className="rounded-2xl border mb-6" style={{ backgroundColor: '#FFFAF5', borderColor: '#E8DDD2' }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#E8DDD2' }}>
            <h3 className="font-display font-black text-base" style={{ color: '#1A1210' }}>My Listings</h3>
            <Link to="/list" className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#C96A3A' }}>
              <Plus size={13} /> Add New
            </Link>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C96A3A' }} />
            </div>
          ) : myListings.length === 0 ? (
            <div className="p-8 text-center">
              <div className="flex justify-center mb-3"><Home size={40} className="text-terracotta" /></div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#1A1210' }}>No listings yet</p>
              <p className="text-xs mb-4" style={{ color: '#8A7E78' }}>List your first property to start matching with buyers</p>
              <Link to="/list" className="btn-primary text-sm px-6 py-2.5 inline-flex">List a Property →</Link>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#E8DDD2' }}>
              {myListings.map(listing => (
                <Link key={listing.id} to={`/property/${listing.id}`}
                  className="p-4 flex items-center gap-4 hover:bg-[#F9F5F0] transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: '#1A1210' }}>{listing.title}</p>
                    <p className="text-xs mt-1" style={{ color: '#8A7E78' }}>
                      ₦{Number(listing.price).toLocaleString()} · {listing.category}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1.5 rounded-full"
                    style={{
                      backgroundColor: listing.status === 'active' ? 'rgba(122,158,126,0.15)' : 'rgba(201,106,58,0.15)',
                      color: listing.status === 'active' ? '#5C8060' : '#8A6A20',
                    }}>
                    {listing.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-3">
          {QUICK_LINKS.map(({ to, icon, label, active, comingSoon }) => (
          <div key={label} className="relative">
            {comingSoon ? (
              <div className="flex flex-col items-center justify-center p-4 rounded-3xl border-2 border-dashed opacity-50"
                style={{ backgroundColor:'rgba(26,18,16,0.03)', borderColor:'#E8DDD2', minHeight:90 }}>
                {icon}
                <span className="text-xs font-semibold mt-1.5 text-center" style={{ color:'#8A7E78' }}>{label}</span>
                <span className="mt-1.5 px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor:'rgba(212,168,83,0.15)', color:'#8A6A20' }}>Coming Soon</span>
              </div>
            ) : (
              <Link to={to} className="flex flex-col items-center justify-center p-4 rounded-3xl border transition-all hover:-translate-y-0.5"
                style={{ backgroundColor:'white', borderColor:'#E8DDD2', minHeight:90 }}>
                {icon}
                <span className="text-xs font-semibold mt-1.5 text-center" style={{ color:'#1A1210' }}>{label}</span>
              </Link>
            )}
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}
