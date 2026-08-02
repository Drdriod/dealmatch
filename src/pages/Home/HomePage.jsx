import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Bot, Briefcase, CheckCircle, Handshake, Home, Hotel, Search, Shield, Users, Zap } from 'lucide-react'
import { FadeUp, StaggerChildren, StaggerItem } from '@/components/ui/ScrollReveal'
import AnimatedStat from '@/components/ui/AnimatedStat'
import HeroBackground from '@/components/ui/HeroBackground'
import PropertyCarousel from '@/components/ui/PropertyCarousel'
import FAQSection from '@/components/ui/FAQSection'
import TestimonialsSection from '@/components/ui/TestimonialsSection'
import { useAuth } from '@/context/AuthContext'
import { getProperties, supabase } from '@/lib/supabase'

// Stats are now fetched live from the database (see loadStats below) -
// no hardcoded numbers. A new platform should show its real, honest
// numbers rather than invented traction figures.

const HOW_IT_WORKS = [
  { icon: <Search size={32} className="text-terracotta" />, step:'01', title:'Say What You Need, or What You Offer',  desc:'A flat, a freelancer, a flatbed truck. Anything. Takes 2 minutes.' },
  { icon: <Bot size={32} className="text-terracotta" />, step:'02', title:'We Match You Against Verified Supply or Demand', desc:'Real people, checked and rated, not cold listings.' },
  { icon: <Handshake size={32} className="text-terracotta" />, step:'03', title:'Talk Directly. Close the Deal.',        desc:'No middleman holding the conversation hostage.' },
]

const CATEGORY_STRIP = [
  { label: 'Real Estate', to: '/browse' },
  { label: 'Rentals', to: '/rentals' },
  { label: 'Artisans', to: '/marketplace/artisans' },
  { label: 'Automotive', to: '/marketplace/automotive' },
  { label: 'Professional & Business Services', to: '/forum/professional-business-services' },
  { label: 'Education & Tutoring', to: '/forum/education-tutoring-skill-exchange' },
  { label: 'Logistics & Equipment', to: '/forum/logistics-haulage-equipment-rental' },
  { label: 'Events & Hospitality', to: '/forum/events-hospitality-entertainment' },
  { label: 'Health & Home Care', to: '/forum/health-wellness-home-care' },
]

const FEATURES = [
  { icon: <Bot size={32} className="text-terracotta" />, title:'AI-Powered Matching',   desc:'Pinecone vector search matches you with properties based on deep preference analysis: not just filters.' },
  { icon: <Shield size={36} className="text-terracotta" />, title:'Escrow Protection',      desc:'Pay rent and deposits safely. Funds held until you confirm move-in: landlords cannot touch it early.' },
  { icon: <CheckCircle size={36} className="text-terracotta" />, title:'Verified Listings',      desc:'Every listing reviewed by our team. Fake listings and scams blocked before they reach you.' },
  { icon: <Briefcase size={36} className="text-terracotta" />, title:'Pro Network',            desc:'Verified surveyors, inspectors, lawyers, and lenders: swipe through them like properties.' },
  { icon: <Hotel size={36} className="text-terracotta" />, title:'Hotel Bookings',         desc:'Book hotels and short-lets with full date/guest/room management and price calculator.' },
]


export default function HomePage() {
  const { isAuthenticated } = useAuth()
  const [featuredProps, setFeaturedProps] = useState([])
  const [stats, setStats] = useState(null) // null while loading - avoids flashing 0s

  useEffect(() => {
    getProperties({ limit: 9 }).then(({ data }) => setFeaturedProps(data || []))
    loadRealStats()
  }, [])

  // Real, honest platform numbers - pulled live, never invented.
  // A new platform should show what it actually has, not fabricated traction.
  const loadRealStats = async () => {
    try {
      const [{ count: propertyCount }, { count: verifiedCount }, { count: soldCount }] = await Promise.all([
        supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_live_verified', true),
        supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'sold'),
      ])

      setStats([
        { value: String(propertyCount ?? 0),  suffix: '+', label: 'Properties Listed' },
        { value: String(verifiedCount ?? 0),  suffix: '+', label: 'Verified Users' },
        { value: 'AI',                        suffix: '',  label: 'Powered Matching' },
        { value: String(soldCount ?? 0),      suffix: '',  label: 'Deals Closed' },
      ])
    } catch (err) {
      console.error('loadRealStats error:', err.message)
      // Fail gracefully - never show fake numbers if the query fails
      setStats([
        { value: '0', suffix: '+', label: 'Properties Listed' },
        { value: '0', suffix: '+', label: 'Verified Users' },
        { value: 'AI', suffix: '', label: 'Powered Matching' },
        { value: '0', suffix: '', label: 'Deals Closed' },
      ])
    }
  }

  return (
    <div style={{ backgroundColor:'#FAF6F0' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Animated particle canvas */}
        <HeroBackground />
        {/* Gradient overlays */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0" style={{ background:'linear-gradient(160deg, #FAF6F0 0%, #F0E8DC 50%, #E8DDD2 100%)' }} />
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-25" style={{ backgroundColor:'#C96A3A', transform:'translate(30%,-30%)' }} />
          <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-20" style={{ backgroundColor:'#7A9E7E', transform:'translate(-30%,30%)' }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-8"
              style={{ backgroundColor:'rgba(201,106,58,0.12)', color:'#C96A3A' }}>
              <Zap size={11} /> Vetted Supply. Real Demand. Matched.
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.7, delay:0.1 }}
            className="font-display font-black leading-tight mb-4"
            style={{ fontSize:'clamp(2.4rem,7vw,5rem)', color:'#1A1210', letterSpacing:'-0.02em' }}>
            Tell Us What You Need.<br />
            <span style={{ color:'#C96A3A' }}>We'll Find Who Has It.</span>
          </motion.h1>

          <motion.p initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.6, delay:0.2 }}
            className="text-lg leading-relaxed mb-4 max-w-xl mx-auto"
            style={{ color:'rgba(26,18,16,0.55)' }}>
            DealMatch matches real demand with vetted supply (property, talent, equipment, expertise) so you stop searching and start closing.
          </motion.p>

          {/* Tagline */}
          <motion.p initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.6, delay:0.25 }}
            className="text-sm font-semibold mb-10 text-center"
            style={{ color:'#C96A3A' }}>
            Every listing matched, not just posted
          </motion.p>

          <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.6, delay:0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={isAuthenticated ? '/browse' : '/auth?tab=signup'} className="btn-primary text-base px-8 py-4 flex items-center justify-center gap-2">
              Get Matched <ArrowRight size={16} />
            </Link>
            <a href="#how-it-works" className="btn-secondary text-base px-8 py-4">See How It Works</a>
          </motion.div>

          {/* Stats */}
          <motion.div initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.7, delay:0.5 }}
            className="mt-20 rounded-3xl p-8 grid grid-cols-2 md:grid-cols-4 gap-8"
            style={{ backgroundColor:'#1A1210' }}>
            {stats
              ? stats.map((s, i) => <AnimatedStat key={i} value={s.value} suffix={s.suffix} label={s.label} />)
              : [0,1,2,3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-8 w-16 mx-auto rounded-lg mb-2" style={{ backgroundColor:'rgba(255,255,255,0.08)' }} />
                    <div className="h-3 w-20 mx-auto rounded-lg" style={{ backgroundColor:'rgba(255,255,255,0.05)' }} />
                  </div>
                ))}
          </motion.div>
        </div>
      </section>

      {/* ── Category Strip ──────────────────────────────── */}
      <section className="py-10 px-6" style={{ backgroundColor:'#FFFFFF', borderTop:'1px solid #E8DDD2', borderBottom:'1px solid #E8DDD2' }}>
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm font-semibold mb-5" style={{ color:'#8A7E78' }}>
            From a two-bedroom flat to a fleet of trucks: if it's a real deal, it's a DealMatch.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {CATEGORY_STRIP.map(c => (
              <Link key={c.label} to={c.to}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-colors"
                style={{ backgroundColor:'#FAF6F0', color:'#3a2f2a' }}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Properties Carousel ─────────────────── */}
      {featuredProps.length > 0 && (
        <section className="py-20 px-6" style={{ backgroundColor:'#FFFFFF' }}>
          <div className="max-w-6xl mx-auto">
            <FadeUp>
              <PropertyCarousel
                properties={featuredProps}
                title="Featured Deals"
                subtitle="Fresh listings matched by AI: updated daily"
              />
            </FadeUp>
          </div>
        </section>
      )}

      {/* ── How It Works ─────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6" style={{ backgroundColor:'#FAF6F0' }}>
        <div className="max-w-4xl mx-auto">
          <FadeUp>
            <div className="text-center mb-16">
              <p className="section-tag">Simple Process</p>
              <h2 className="section-title mb-4">How DealMatch Works</h2>
              <p className="section-sub mx-auto">Three steps from need to deal.</p>
            </div>
          </FadeUp>
          <StaggerChildren className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((item, i) => (
              <StaggerItem key={i}>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5"
                    style={{ backgroundColor:'rgba(201,106,58,0.08)' }}>{item.icon}</div>
                  <p className="text-xs font-bold tracking-widest mb-2" style={{ color:'#C96A3A' }}>STEP {item.step}</p>
                  <h3 className="font-display font-black text-xl mb-3" style={{ color:'#1A1210' }}>{item.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color:'#8A7E78' }}>{item.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ backgroundColor:'#FFFFFF' }}>
        <div className="max-w-5xl mx-auto">
          <FadeUp>
            <div className="text-center mb-16">
              <p className="section-tag">Everything You Need</p>
              <h2 className="section-title mb-4">Built to Match, Not Just List</h2>
            </div>
          </FadeUp>
          <StaggerChildren className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <StaggerItem key={i}>
                <div className="rounded-3xl p-6 h-full border transition-all hover:-translate-y-1"
                  style={{ backgroundColor:'#FAF6F0', borderColor:'#E8DDD2', boxShadow:'0 4px 20px rgba(26,18,16,0.04)' }}>
                  <div className="flex justify-center mb-4">{f.icon}</div>
                  <h3 className="font-display font-black text-lg mb-2" style={{ color:'#1A1210' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color:'#8A7E78' }}>{f.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </div>
      </section>



      {/* ── Testimonials ─────────────────────────────────── */}
      <TestimonialsSection />

      {/* ── FAQ ──────────────────────────────────────────── */}
      <FAQSection />

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ backgroundColor:'#FFFFFF' }}>
        <div className="max-w-3xl mx-auto">
          <FadeUp>
            <div className="rounded-3xl p-12 text-center relative overflow-hidden" style={{ backgroundColor:'#1A1210' }}>
              <HeroBackground />
              <div className="absolute inset-0 pointer-events-none" style={{ background:'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(201,106,58,0.25) 0%, transparent 70%)' }} />
              <div className="relative">
                <div className="flex justify-center mb-6"><Home size={48} className="text-terracotta" /></div>
                <h2 className="font-display font-black text-4xl mb-3 text-white">Ready to Find Your Deal?</h2>
                <p className="text-sm mb-2" style={{ color:'rgba(255,255,255,0.5)' }}>
                  Join Nigerians who found their match through DealMatch: property, talent, equipment, and more.
                </p>
                <p className="text-sm font-semibold mb-8" style={{ color:'rgba(201,106,58,0.8)' }}>
                  Every listing matched, not just posted
                </p>
                <Link to={isAuthenticated ? '/browse' : '/auth?tab=signup'} className="btn-primary text-base px-10 py-4 inline-flex items-center gap-2">
                  Get Matched <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </div>
  )
}
