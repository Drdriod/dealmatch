import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Bot, Building2, Eye, Handshake, Lock, Search, ShieldCheck } from 'lucide-react'
import { FadeUp, StaggerChildren, StaggerItem } from '@/components/ui/ScrollReveal'
import AnimatedStat from '@/components/ui/AnimatedStat'
import HeroBackground from '@/components/ui/HeroBackground'
import FAQSection from '@/components/ui/FAQSection'
import TestimonialsSection from '@/components/ui/TestimonialsSection'
import HeroSearch from '@/components/home/HeroSearch'
import PhotoPlaceholder from '@/components/home/PhotoPlaceholder'
import FindOfferCard from '@/components/home/FindOfferCard'
import PostChoiceModal from '@/components/home/PostChoiceModal'
import PlacesRail from '@/components/home/PlacesRail'
import PeopleRail from '@/components/home/PeopleRail'
import HowItWorksFlip from '@/components/home/HowItWorksFlip'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

// Stats are now fetched live from the database (see loadStats below) -
// no hardcoded numbers. A new platform should show its real, honest
// numbers rather than invented traction figures.


export default function HomePage() {
  const { isAuthenticated } = useAuth()
  const [stats, setStats] = useState(null) // null while loading - avoids flashing 0s
  const [showPostChoice, setShowPostChoice] = useState(false)

  // Hero image rotation - autoplay 6s, pause on hover/focus, per the brief.
  // Alternates Place/Person per the reference sheet (shortlet, plumber,
  // house rent, home lesson teacher) so the hero itself echoes "See the
  // place. See the person." rather than only ever showing one side.
  // Source resolution is ~800x280 (extracted from a reference composite,
  // not native photography) - fine for this rotation, but soft if
  // rendered very large on a big desktop monitor. Swap for true
  // 2400x1350 photography when available; same array, same rotation logic.
  const HERO_IMAGES = [
    '/home/hero-place-shortlet.webp',
    '/home/hero-person-plumber.webp',
    '/home/hero-place-house.webp',
    '/home/hero-person-teacher.webp',
  ]
  const [heroIdx, setHeroIdx] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  useEffect(() => {
    if (HERO_IMAGES.length < 2 || heroPaused) return
    const t = setInterval(() => setHeroIdx(i => (i + 1) % HERO_IMAGES.length), 6000)
    return () => clearInterval(t)
  }, [heroPaused])

  useEffect(() => {
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

      // A raw "0" (or a near-zero count) as social proof is worse than no
      // number at all -- it reads as "nobody uses this" to a first-time,
      // problem-aware visitor exactly when we're trying to earn trust.
      // Below a real-traction threshold, show what's actually true and
      // doesn't depend on volume instead: the platform's own protective
      // mechanisms (escrow, dual verification, physical inspection).
      // Swap this threshold out for plain counts once real usage clears it.
      const hasRealTraction = (propertyCount ?? 0) >= 5 || (soldCount ?? 0) >= 3

      if (hasRealTraction) {
        setStats([
          { value: String(propertyCount ?? 0),  suffix: '+', label: 'Properties Listed' },
          { value: String(verifiedCount ?? 0),  suffix: '+', label: 'Verified Users' },
          { value: 'AI',                        suffix: '',  label: 'Powered Matching' },
          { value: String(soldCount ?? 0),      suffix: '',  label: 'Deals Closed' },
        ])
      } else {
        setStats('mechanisms')
      }
    } catch (err) {
      console.error('loadRealStats error:', err.message)
      // Fail gracefully -- mechanism badges, never fake or zero numbers
      setStats('mechanisms')
    }
  }

  return (
    <div style={{ backgroundColor:'#FAF6F0' }}>

      {/* ── Hero: full-bleed photo, not a cream gradient, per the visual/
           motion brief. Rotates through the 4 Place/Person reference
           photos every 6s, pauses on hover/focus. Source images are
           ~800x280 (extracted from a reference sheet, not native
           photography) - fine for now, swap HERO_IMAGES for true
           2400x1350 photography when available; same rotation logic. ── */}
      <section
        className="relative min-h-[92vh] flex items-end overflow-hidden"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
        onFocus={() => setHeroPaused(true)}
        onBlur={() => setHeroPaused(false)}
      >
        <div className="absolute inset-0">
          {HERO_IMAGES[heroIdx] ? (
            <img src={HERO_IMAGES[heroIdx]} alt="" className="w-full h-full object-cover" />
          ) : (
            <PhotoPlaceholder iconSize={64} />
          )}
        </div>
        {/* Dark veil, 30-45% per the brief - enough for white text to stay
            legible without hiding the photo entirely. */}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(26,26,26,0.38)' }} />

        <div className="relative w-full max-w-5xl mx-auto px-6 pb-16 pt-32">
          <motion.h1
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }}
            className="font-display font-black leading-tight mb-3"
            style={{ fontSize: 'clamp(2.2rem,6vw,4rem)', color: '#FFFFFF' }}>
            Find what you need. Find who can provide it.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut', delay: 0.06 }}
            className="text-base sm:text-lg mb-8 max-w-lg"
            style={{ color: 'rgba(255,255,255,0.85)' }}>
            Places to stay, homes to rent, and people ready to help.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut', delay: 0.12 }} className="mb-6">
            <HeroSearch />
          </motion.div>

          {/* Single remaining CTA, per the homepage rework: the search bar
              above is now the primary action (it goes to /search, the new
              universal-search page - see HeroSearch.jsx). The old "Find a
              Place" / "Find a Person" buttons are gone; this is the only
              button left, and it opens the listing-choice modal rather
              than linking anywhere directly. */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut', delay: 0.18 }}
            className="flex justify-center max-w-xl mx-auto">
            <button onClick={() => setShowPostChoice(true)} type="button"
              className="text-center py-3.5 px-8 rounded-full text-sm font-bold"
              style={{ backgroundColor: '#C45C26', color: '#FFFFFF' }}>
              Offer something →
            </button>
          </motion.div>
        </div>
      </section>

      {/* Stats: real numbers once there's real volume to show; until
          then, the mechanisms that make this platform actually safe,
          which are true and worth stating on day one regardless of
          how many people have used it yet. Kept as its own section
          right after the hero rather than nested inside it. */}
      <section className="px-6 -mt-10 relative z-10">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}
            className="rounded-3xl px-2 py-6 sm:p-8 grid grid-cols-4 gap-2 sm:gap-8"
            style={{ backgroundColor:'#1A1210' }}>
            {stats === 'mechanisms' ? (
              [
                { icon: Lock,        label: 'Protection-Backed' },
                { icon: ShieldCheck, label: 'Identity + Skill Verified' },
                { icon: Eye,         label: 'Physically Inspected' },
                { icon: Bot,         label: 'AI + Location Matched' },
              ].map((m, i) => (
                <div key={i} className="flex flex-col items-center gap-2 text-center">
                  <m.icon size={20} style={{ color: '#C96A3A' }} />
                  <p className="text-[10px] sm:text-xs font-semibold leading-tight" style={{ color: 'rgba(255,255,255,0.7)' }}>{m.label}</p>
                </div>
              ))
            ) : stats ? (
              stats.map((s, i) => <AnimatedStat key={i} value={s.value} suffix={s.suffix} label={s.label} />)
            ) : (
              [0,1,2,3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-8 w-16 mx-auto rounded-lg mb-2" style={{ backgroundColor:'rgba(255,255,255,0.08)' }} />
                    <div className="h-3 w-20 mx-auto rounded-lg" style={{ backgroundColor:'rgba(255,255,255,0.05)' }} />
                  </div>
                ))
            )}
          </motion.div>
        </div>
      </section>

      {/* ── Two doors: "What are you here to do?" ───────────────────── */}
      <section className="pt-16 pb-6 px-6" style={{ backgroundColor: '#F8F1E9' }}>
        <div className="max-w-4xl mx-auto">
          <FadeUp>
            <p className="text-center font-display text-xl sm:text-2xl font-black mb-6" style={{ color: '#1A1A1A' }}>
              What are you here to do?
            </p>
          </FadeUp>
          <div className="grid sm:grid-cols-2 gap-4">
            <FindOfferCard
              variant="looking"
              icon={Search}
              title="I'm looking"
              description="Find a place or person that fits what you need."
              ctaLabel="Start searching"
              to="/search"
            />
            <FindOfferCard
              variant="offering"
              icon={Building2}
              title="I have something"
              description="Offer your property, skill or service to people looking for it."
              ctaLabel="Start offering"
              onClick={() => setShowPostChoice(true)}
            />
          </div>
        </div>
      </section>
      <PostChoiceModal open={showPostChoice} onClose={() => setShowPostChoice(false)} />

      {/* ── Trust section: deliberately scoped wording ("where escrow is
           enabled", "when a transaction uses escrow") rather than claiming
           universal protection - not every flow on the platform runs
           through escrow yet, and overstating that was the exact problem
           being fixed here. The 4-badge stats grid above already covers
           the broader "why trust us" stats; this is the plain-language
           explanation underneath it. ────────────────────────────────── */}
      <section className="py-16 px-6" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-4xl mx-auto">
          <FadeUp>
            <p className="text-center font-display text-xl sm:text-2xl font-black mb-10" style={{ color: '#1A1A1A' }}>
              Built for better connections.
            </p>
          </FadeUp>
          <StaggerChildren className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: ShieldCheck, title: 'Verified providers', body: 'Find providers who have passed the required verification level.' },
              { icon: Lock,        title: 'Protected contact',  body: 'Where escrow is enabled, contact details remain protected until the required transaction step is completed.' },
              { icon: Handshake,   title: 'Secure payments',    body: 'When a DealMatch transaction uses escrow, payment is handled through the protected transaction flow.' },
            ].map((item, i) => (
              <StaggerItem key={i}>
                <div className="text-center px-2">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(196,92,38,0.1)' }}>
                    <item.icon size={22} style={{ color: '#C45C26' }} />
                  </div>
                  <h3 className="font-display text-base font-black mb-1.5" style={{ color: '#1A1A1A' }}>{item.title}</h3>
                  <p className="text-sm" style={{ color: '#5A4F49' }}>{item.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* ── Places near you / People near you ────────────────────────── */}
      <PlacesRail />
      <PeopleRail />

      {/* ── How DealMatch Works, brought back as motion instead of text:
           an auto-flipping, swipeable card sequence rather than the old
           static 3-tile grid that just repeated what the hero already
           said. ─────────────────────────────────────────────────────── */}
      <HowItWorksFlip />

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
                <div className="flex justify-center mb-6"><Handshake size={48} className="text-terracotta" /></div>
                <h2 className="font-display font-black text-4xl mb-3 text-white">Your Next Match Is Waiting</h2>
                <p className="text-sm mb-2" style={{ color:'rgba(255,255,255,0.5)' }}>
                  Join Nigerians who found their match through DealMatch: property, talent, equipment, and more.
                </p>
                <p className="text-sm font-semibold mb-8" style={{ color:'rgba(201,106,58,0.8)' }}>
                  Every listing matched, not just posted
                </p>
                <Link to={isAuthenticated ? '/start' : '/auth?tab=signup'} className="btn-primary text-base px-10 py-4 inline-flex items-center gap-2">
                  Join DealMatch <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </div>
  )
}
