import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, Command, Heart, LogOut, Menu, Search, User, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import SearchPalette from '@/components/ui/SearchPalette'
import NotificationBell from '@/components/ui/NotificationBell'
import { ThemeToggle } from '@/context/ThemeContext'

export default function Navbar() {
  const { isAuthenticated, profile } = useAuth()
  const [scrolled, setScrolled]     = useState(false)
  const [menuOpen, setMenuOpen]     = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen]     = useState(false)
  const [exploreOpen, setExploreOpen] = useState(false)
  const location = useLocation()
  const navigate  = useNavigate()
  const isHome    = location.pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false); setMoreOpen(false); setExploreOpen(false) }, [location])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(o => !o) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSignOut = async () => {
    try { await supabase.auth.signOut({ scope: 'local' }) } catch (e) {}
    window.location.href = '/'
  }

  const solid  = scrolled || !isHome
  const navBg  = solid ? 'rgba(255,250,245,0.97)' : 'transparent'
  const shadow = solid ? '0 1px 0 rgba(26,18,16,0.08), 0 4px 24px rgba(26,18,16,0.04)' : 'none'

  // Primary nav always visible
  const PRIMARY = [
    { to:'/browse',           label:'Buy' },
    { to:'/rentals',          label:'Rent' },
    { to:'/hotels',           label:'Hotels' },
    { to:null, label:'Student Hostels', comingSoon:true, highlight: true },
    { to:'/forum',            label:'Forum' },
  ]
  // Secondary nav - collapsed into "More" on medium screens, visible on large
  const SECONDARY = [
    { to:'/professionals', label:'For Pros' },
    { to:'/escrow',        label:'My Wallet' },
    { to:'/availability',  label:'Manage Listings' },
  ]
  // Every other vertical, grouped by the same three Intent Filters used
  // throughout the site's copy (Need a Service / Buy or Rent / Get Matched).
  // Leaf categories route to their marketplace pages now (schema-driven
  // browse/composer, ADR-013). Group-level links elsewhere on the site
  // (e.g. HomePage's category strip) still point at the forum, since the
  // marketplace has no parent-hub view yet, only leaf-category pages.
  const EXPLORE_GROUPS = [
    {
      title: 'Need a Service',
      items: [
        { to:'/marketplace/artisans', label:'Skilled Artisans' },
        { to:'/marketplace/corporate-legal', label:'Corporate & Legal' },
        { to:'/marketplace/tech-digital-services', label:'Tech & Digital Services' },
        { to:'/marketplace/private-special-education', label:'Tutoring & Exam Prep' },
        { to:'/marketplace/event-ecosystem', label:'Event Vendors' },
        { to:'/marketplace/in-home-healthcare', label:'In-Home Healthcare' },
        { to:'/marketplace/fitness-lifestyle', label:'Fitness & Wellness' },
      ],
    },
    {
      title: 'Buy or Rent',
      items: [
        { to:'/marketplace/automotive', label:'Automotive' },
        { to:'/marketplace/heavy-machinery-asset-leasing', label:'Heavy Machinery & Equipment' },
      ],
    },
    {
      title: 'Get Matched',
      items: [
        { to:'/marketplace/interstate-haulage-freight', label:'Haulage & Freight' },
        { to:'/marketplace/b2b-procurement', label:'B2B Procurement' },
        { to:'/marketplace/agricultural-logistics', label:'Agricultural Logistics' },
        { to:'/marketplace/vocational-training', label:'Vocational Training' },
      ],
    },
  ]
  // Mortgage hidden from nav until real Nigerian lender partnerships are
  // researched and confirmed - see /mortgage which shows a Coming Soon
  // screen if someone reaches it directly.

  const linkStyle = (active) => ({
    color: active ? '#C96A3A' : 'rgba(26,18,16,0.65)',
    fontWeight: active ? 600 : 500,
    fontSize: 14,
    padding: '6px 12px',
    borderRadius: 10,
    transition: 'all .15s',
    whiteSpace: 'nowrap',
    backgroundColor: active ? 'rgba(201,106,58,0.08)' : 'transparent',
  })

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: navBg,
        borderBottom: solid ? '1px solid rgba(26,18,16,0.08)' : '1px solid transparent',
        backdropFilter: solid ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: solid ? 'blur(16px)' : 'none',
        transition: 'all 0.25s ease',
        boxShadow: shadow,
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Logo */}
          <Link to="/" style={{ fontFamily:"'DM Serif Display',Georgia,serif", fontSize: 22, fontWeight: 900, color: '#C96A3A', flexShrink: 0, marginRight: 8, letterSpacing: '-0.3px' }}>
            Deal<span style={{ color:'#1A1210' }}>Match</span>
          </Link>

          {/* Search bar - desktop */}
          <button onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2.5 transition-colors hover:bg-black/5"
            style={{ flex: '0 0 220px', padding: '8px 14px', borderRadius: 12, backgroundColor: 'rgba(26,18,16,0.05)', border: '1px solid transparent' }}>
            <Search size={13} style={{ color:'rgba(26,18,16,0.3)', flexShrink:0 }} />
            <span style={{ flex:1, fontSize:13, color:'rgba(26,18,16,0.3)', textAlign:'left' }}>Search properties...</span>
            <kbd style={{ fontSize:10, color:'rgba(26,18,16,0.25)', backgroundColor:'rgba(26,18,16,0.07)', padding:'2px 5px', borderRadius:5, fontFamily:'monospace' }}>⌘K</kbd>
          </button>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center" style={{ flex:1, justifyContent:'center', gap:2 }}>
            {PRIMARY.map(l => (
              l.comingSoon ? (
                <span key={l.label}
                  style={{ ...linkStyle(false), opacity:0.4, cursor:'not-allowed', position:'relative' }}>
                  {l.label}
                  <span style={{ marginLeft:4, fontSize:9, fontWeight:700, color:'#8A6A20', backgroundColor:'rgba(212,168,83,0.2)', padding:'1px 5px', borderRadius:4 }}>Soon</span>
                </span>
              ) : (
                <Link key={l.label} to={l.to || "/"}
                  style={{
                    ...linkStyle(location.pathname === l.to),
                    ...(l.highlight && location.pathname !== l.to ? { color: '#C96A3A', fontWeight: 600 } : {}),
                  }}
                  className="hover:bg-black/5">
                  {l.label}
                </Link>
              )
            ))}
            <div style={{ width:1, height:16, backgroundColor:'rgba(26,18,16,0.1)', margin:'0 4px' }} />
            {/* Explore dropdown - every other category, grouped by intent */}
            <div className="relative">
              <button onClick={() => setExploreOpen(o => !o)}
                className="flex items-center gap-1 hover:bg-black/5"
                style={{ ...linkStyle(false), display:'flex', alignItems:'center', gap:4 }}>
                Explore <ChevronDown size={12} style={{ transition:'transform .2s', transform: exploreOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              <AnimatePresence>
                {exploreOpen && (
                  <motion.div initial={{ opacity:0, y:6, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:4, scale:.97 }}
                    transition={{ duration:.15 }}
                    style={{ position:'absolute', top:'calc(100% + 8px)', left:'50%', transform:'translateX(-50%)', width:640, backgroundColor:'#FFFAF5', borderRadius:20, border:'1px solid #E8DDD2', boxShadow:'0 20px 60px rgba(26,18,16,0.15)', overflow:'hidden', zIndex:60, padding:'20px 8px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
                      {EXPLORE_GROUPS.map(group => (
                        <div key={group.title} style={{ padding:'0 12px' }}>
                          <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'#C96A3A', marginBottom:8 }}>{group.title}</p>
                          {group.items.map(item => (
                            <Link key={item.to} to={item.to}
                              style={{ display:'block', padding:'6px 8px', margin:'0 -8px', borderRadius:8, fontSize:13, color:'#3A2E28', fontWeight:500 }}
                              className="hover:bg-[#F5EDE0] transition-colors">{item.label}</Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div style={{ width:1, height:16, backgroundColor:'rgba(26,18,16,0.1)', margin:'0 4px' }} />
            {SECONDARY.map(l => (
              <Link key={l.label} to={l.to || "/"}
                style={linkStyle(location.pathname === l.to)}
                className="hover:bg-black/5">{l.label}</Link>
            ))}
          </div>

          {/* Medium screens: primary + More dropdown */}
          <div className="hidden md:flex lg:hidden items-center" style={{ flex:1, justifyContent:'center', gap:2 }}>
            {PRIMARY.map(l => (
              l.comingSoon ? (
                <span key={l.label} style={{ ...linkStyle(false), opacity:0.4, cursor:'not-allowed' }}>
                  {l.label}<span style={{ marginLeft:4, fontSize:9, fontWeight:700, color:'#8A6A20', backgroundColor:'rgba(212,168,83,0.2)', padding:'1px 5px', borderRadius:4 }}>Soon</span>
                </span>
              ) : (
                <Link key={l.label} to={l.to || "/"}
                  style={{ ...linkStyle(location.pathname === l.to), ...(l.highlight && location.pathname !== l.to ? { color: '#C96A3A', fontWeight: 600 } : {}) }}
                  className="hover:bg-black/5">{l.label}</Link>
              )
            ))}
            {/* More dropdown */}
            <div className="relative">
              <button onClick={() => setMoreOpen(o => !o)}
                className="flex items-center gap-1 hover:bg-black/5"
                style={{ ...linkStyle(false), display:'flex', alignItems:'center', gap:4 }}>
                More <ChevronDown size={12} style={{ transition:'transform .2s', transform: moreOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              <AnimatePresence>
                {moreOpen && (
                  <motion.div initial={{ opacity:0, y:6, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:4, scale:.97 }}
                    transition={{ duration:.15 }}
                    style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:280, maxHeight:'70vh', overflowY:'auto', backgroundColor:'#FFFAF5', borderRadius:16, border:'1px solid #E8DDD2', boxShadow:'0 12px 40px rgba(26,18,16,0.12)', zIndex:60 }}>
                    {EXPLORE_GROUPS.map(group => (
                      <div key={group.title} style={{ padding:'10px 16px 4px' }}>
                        <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'#C96A3A', marginBottom:2 }}>{group.title}</p>
                        {group.items.map(item => (
                          <Link key={item.to} to={item.to}
                            style={{ display:'block', padding:'7px 0', fontSize:13, color:'#3A2E28', fontWeight:500 }}
                            className="hover:text-terracotta transition-colors">{item.label}</Link>
                        ))}
                      </div>
                    ))}
                    <div style={{ borderTop:'1px solid #E8DDD2', marginTop:6 }}>
                      {SECONDARY.map(l => (
                        <Link key={l.label} to={l.to || "/"}
                          style={{ display:'block', padding:'10px 16px', fontSize:13, color:'#3A2E28', fontWeight:500 }}
                          className="hover:bg-[#F5EDE0] transition-colors">{l.label}</Link>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-2 ml-auto flex-shrink-0">
            <ThemeToggle />
            <Link to="/list"
              style={{ backgroundColor:'#C96A3A', color:'#FFFFFF', fontSize:13, fontWeight:600, padding:'8px 18px', borderRadius:10, boxShadow:'0 2px 8px rgba(201,106,58,0.25)', whiteSpace:'nowrap' }}
              className="hover:opacity-90 transition-opacity">
              Sell
            </Link>
            {isAuthenticated ? (
              <div className="flex items-center gap-1">
                <Link to="/matches" style={{ display:'flex', alignItems:'center', gap:5, fontSize:13, fontWeight:500, color:'rgba(26,18,16,0.6)', padding:'7px 10px', borderRadius:10 }} className="hover:bg-black/5">
                  <Heart size={14} /> Matches
                </Link>
                <Link to="/messages" style={{ fontSize:13, fontWeight:500, color:'rgba(26,18,16,0.6)', padding:'7px 10px', borderRadius:10 }} className="hover:bg-black/5">
                  Messages
                </Link>
                <NotificationBell />
                {/* Avatar + dropdown */}
                <div className="relative group" style={{ marginLeft:4 }}>
                  <button style={{ width:34, height:34, borderRadius:'50%', overflow:'hidden', border:'2px solid #E8DDD2', backgroundColor:'rgba(201,106,58,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : <User size={14} style={{ color:'#C96A3A' }} />}
                  </button>
                  <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:200, backgroundColor:'#FFFAF5', borderRadius:16, border:'1px solid #E8DDD2', boxShadow:'0 16px 48px rgba(26,18,16,0.13)', overflow:'hidden', zIndex:60 }}
                    className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 translate-y-1 group-hover:translate-y-0">
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8DDD2' }}>
                      <p style={{ fontSize:12, fontWeight:600, color:'#1A1210', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.full_name || 'Your Account'}</p>
                      <p style={{ fontSize:11, color:'#8A7E78', textTransform:'capitalize', marginTop:2 }}>{profile?.role}</p>
                    </div>
                    {[
                      { to:'/dashboard', label:'Dashboard' },
              { to:'/referrals', label:'Earn' },
                      { to:'/profile',   label:'Profile' },
                      ...(profile?.role === 'admin' ? [{ to:'/admin', label:'Admin Panel' }] : []),
                      ...(profile?.role === 'agent' ? [{ to:'/agent', label:'Agent Portal' }] : []),
                      ...(['lender','admin'].includes(profile?.role) ? [{ to:'/lender', label:'Lender Dashboard' }] : []),
                    ].map(item => (
                      <Link key={item.to} to={item.to} style={{ display:'flex', alignItems:'center', padding:'10px 16px', fontSize:13, color:'#3A2E28' }} className="hover:bg-[#F5EDE0] transition-colors">{item.label}</Link>
                    ))}
                    <button onClick={handleSignOut} style={{ width:'100%', display:'flex', alignItems:'center', padding:'10px 16px', fontSize:13, color:'#C96A3A' }} className="hover:bg-[#F5EDE0] transition-colors">
                      <LogOut size={13} style={{ marginRight:8 }} /> Sign Out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/auth" style={{ fontSize:13, fontWeight:500, color:'rgba(26,18,16,0.6)', padding:'7px 12px', borderRadius:10 }} className="hover:bg-black/5">Sign In</Link>
                <Link to="/auth?tab=signup" style={{ backgroundColor:'#1A1210', color:'#FFFFFF', fontSize:13, fontWeight:600, padding:'8px 16px', borderRadius:10 }} className="hover:opacity-90 transition-opacity">Get Started</Link>
              </div>
            )}
          </div>

          {/* Mobile controls */}
          <div className="md:hidden flex items-center gap-2 ml-auto">
            <button onClick={() => setSearchOpen(true)} style={{ width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:10 }}>
              <Search size={18} style={{ color:'rgba(26,18,16,0.6)' }} />
            </button>
            {isAuthenticated && <NotificationBell />}
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:10 }}>
              {menuOpen ? <X size={20} style={{ color:'#1A1210' }} /> : <Menu size={20} style={{ color:'#1A1210' }} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }} transition={{ duration:.2 }}
              style={{ backgroundColor:'#FFFAF5', borderTop:'1px solid #E8DDD2', overflow:'hidden' }}>
              <div style={{ padding:'12px 20px 20px', display:'flex', flexDirection:'column', gap:2 }}>
                {[...PRIMARY, ...SECONDARY].map(l => (
                  <Link key={l.label} to={l.to || "/"} style={{ padding:'11px 0', fontSize:15, fontWeight:500, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>
                    {l.label}
                  </Link>
                ))}
                {EXPLORE_GROUPS.map(group => (
                  <div key={group.title} style={{ paddingTop:10 }}>
                    <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'#C96A3A', padding:'6px 0 2px' }}>{group.title}</p>
                    {group.items.map(item => (
                      <Link key={item.to} to={item.to} style={{ display:'block', padding:'9px 0', fontSize:14, fontWeight:500, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ))}
                <Link to="/list" style={{ padding:'11px 0', fontSize:15, fontWeight:700, color:'#C96A3A', borderBottom:'1px solid #F0E6D6' }}>Sell</Link>
                {isAuthenticated ? (
                  <>
                    <Link to="/matches"   style={{ padding:'11px 0', fontSize:15, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>My Matches</Link>
                    <Link to="/messages"  style={{ padding:'11px 0', fontSize:15, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>Messages</Link>
                    <Link to="/dashboard" style={{ padding:'11px 0', fontSize:15, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>Dashboard</Link>
                    {profile?.role === 'agent' && <Link to="/agent" style={{ padding:'11px 0', fontSize:15, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>Agent Portal</Link>}
                    {profile?.role === 'admin' && <Link to="/admin" style={{ padding:'11px 0', fontSize:15, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>Admin Panel</Link>}
                    <Link to="/profile"   style={{ padding:'11px 0', fontSize:15, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>Profile</Link>
                    <button onClick={handleSignOut} style={{ padding:'11px 0', fontSize:15, color:'#C96A3A', textAlign:'left', fontWeight:500 }}>Sign Out</button>
                  </>
                ) : (
                  <>
                    <Link to="/auth" style={{ padding:'11px 0', fontSize:15, color:'#1A1210', borderBottom:'1px solid #F0E6D6' }}>Sign In</Link>
                    <Link to="/auth?tab=signup" style={{ display:'block', textAlign:'center', marginTop:12, padding:'12px 0', backgroundColor:'#C96A3A', color:'#FFFFFF', borderRadius:14, fontSize:14, fontWeight:700 }}>Get Started Free</Link>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
      <SearchPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
