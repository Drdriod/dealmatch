import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Building2, Check, Eye, Handshake, Lock, MapPin, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { FadeUp, StaggerChildren, StaggerItem } from '@/components/ui/ScrollReveal'
import AnimatedStat from '@/components/ui/AnimatedStat'
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
import { fetchHomeCounts } from '@/data/homeRepository'
import { buildHomeStats } from '@/lib/homeStats'
import { prefetchRoutes } from '@/lib/prefetchRoutes'

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
  const HERO_SLIDES = [
    { src: '/home/hero-place-shortlet.webp', title: 'Places to stay', note: 'Near you', alt: 'Bright shortlet apartment interior' },
    { src: '/home/hero-person-plumber.webp', title: 'Home repairs and trades', note: 'Skilled people nearby',   alt: 'Plumber at work' },
    { src: '/home/hero-place-house.webp',    title: 'Homes to rent', note: 'Near you',  alt: 'House available for rent' },
    { src: '/home/hero-person-teacher.webp', title: 'Tutors and teachers', note: 'Skilled people nearby',   alt: 'Teacher giving a home lesson' },
  ]
  const [heroIdx, setHeroIdx] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  useEffect(() => {
    if (HERO_SLIDES.length < 2 || heroPaused) return
    const t = setInterval(() => setHeroIdx(i => (i + 1) % HERO_SLIDES.length), 6000)
    return () => clearInterval(t)
  }, [heroPaused])

  useEffect(() => {
    loadRealStats()
  }, [])

  // Once the home page is up and the browser is idle, fetch the pages people open next so the
  // first click does not wait on a download.
  useEffect(() => {
    const next = [
      () => import('@/pages/Browse/BrowsePage'),
      () => import('@/pages/Property/PropertyPage'),
    ]
    if (!isAuthenticated) next.push(() => import('@/pages/Auth/AuthPage'))
    prefetchRoutes(next)
  }, [isAuthenticated])

  // Real, honest platform numbers - pulled live, never invented.
  // A new platform should show what it actually has, not fabricated traction.
  const loadRealStats = async () => {
    try {
      const [{ count: propertyCount }, { count: verifiedCount }, { count: soldCount }] = await fetchHomeCounts()

      // Numbers stay hidden until the milestone in src/lib/homeStats.js is reached: a small
      // count reads as "nobody uses this". Below it the page shows what the platform does.
      const tiles = buildHomeStats({ properties: propertyCount, verified: verifiedCount, sold: soldCount })
      setStats(tiles || 'mechanisms')
    } catch (err) {
      console.error('loadRealStats error:', err.message)
      // Fail gracefully -- mechanism badges, never fake or zero numbers
      setStats('mechanisms')
    }
  }

  return (
    <div className="bg-cream">

      {/* ── Hero: split layout. Copy + universal search on the left; a
           rotating Place/Person photo card on the right. Source photos are
           ~800x280 so they sit in a framed card (never full-bleed) where
           they stay sharp. Pauses on hover/focus, 6s autoplay. ───────── */}
      <section
        className="grid lg:grid-cols-[1.05fr_0.95fr] max-w-[1440px] mx-auto lg:min-h-[560px]"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
        onFocus={() => setHeroPaused(true)}
        onBlur={() => setHeroPaused(false)}
      >
        <div className="self-center px-5 pt-8 pb-8 sm:px-7 lg:pl-[max(28px,calc((100vw-1240px)/2))] lg:pr-14 lg:py-14">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }}>
            <div className="eyebrow"><Sparkles size={15} /> Built for Nigeria</div>
            <h1 className="mt-4 text-[clamp(38px,10.5vw,50px)] sm:text-[clamp(48px,4.6vw,72px)] leading-[1.02] max-w-[720px] text-deep">
              <span className="block">Find what you need.</span>
              <span className="block">Find who can <em className="not-italic text-terracotta whitespace-nowrap">provide it.</em></span>
            </h1>
            <p className="mt-5 mb-6 max-w-[560px] text-base sm:text-[17px] leading-relaxed text-deep/65">
              Places to stay, homes to rent, and people ready to help.
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut', delay: 0.08 }}>
            <HeroSearch />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut', delay: 0.14 }}
            className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3 text-xs font-semibold text-deep/65">
            <span className="inline-flex items-center gap-2"><Check size={16} className="text-terracotta" /> Free to search</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-terracotta" /> Phone numbers stay hidden until a protected deal step</span>
            <button onClick={() => setShowPostChoice(true)} type="button"
              className="inline-flex items-center gap-1.5 text-deep font-bold border-b border-deep pb-0.5 hover:text-terracotta hover:border-terracotta transition-colors">
              Offer something <ArrowRight size={13} />
            </button>
          </motion.div>
        </div>

        <div className="relative bg-forest-pale lg:bg-transparent px-5 py-6 sm:px-7 lg:p-0 min-h-[260px] lg:min-h-[560px] overflow-hidden">
          <div className="hidden lg:block absolute inset-0 bg-forest-pale" />
          <div className="relative h-full flex items-center lg:px-10">
            <div className="relative w-full max-w-[560px] mx-auto">
              <div className="relative rounded-[28px] overflow-hidden shadow-soft bg-cream-deep" style={{ aspectRatio: '4 / 3' }}>
                {HERO_SLIDES.map((slide, i) => (
                  <img key={slide.src} src={slide.src} alt={i === heroIdx ? slide.alt : ''} aria-hidden={i !== heroIdx}
                    className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
                    style={{ opacity: i === heroIdx ? 1 : 0 }} />
                ))}
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(17,27,21,0.5) 100%)' }} />
                <div className="absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center gap-2 rounded-full bg-forest text-white text-[11px] font-bold py-1.5 pl-1.5 pr-3.5">
                  <span className="w-7 h-7 rounded-full bg-sun text-deep flex items-center justify-center"><Sparkles size={14} /></span>
                  AI + location matched
                </div>
              </div>
              <div className="absolute left-3 right-3 -bottom-5 sm:left-6 sm:right-auto flex items-center gap-3.5 rounded-2xl bg-white/95 backdrop-blur p-3 pr-5 shadow-card">
                <span className="flex items-center gap-1 rounded-xl bg-forest text-white text-[10px] font-bold px-2.5 py-3">
                  <Sparkles size={14} /> Nearby
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[13px] text-deep truncate">{HERO_SLIDES[heroIdx].title}</p>
                  <p className="flex items-center gap-1 text-[11px] text-deep/60"><MapPin size={12} /> {HERO_SLIDES[heroIdx].note}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar: real numbers once there's real volume to show;
           until then, the mechanisms that make the platform safe, which
           are true on day one regardless of how many people use it. ── */}
      <section className="bg-forest text-white" aria-label="DealMatch trust features">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-7 py-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/60 max-w-[220px]">Every profile shows exactly which checks it has passed</p>
          {stats === 'mechanisms' ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-10 gap-y-4">
              {[
                { icon: ShieldCheck, label: 'Identity verified' },
                { icon: Check,       label: 'Skill evidence reviewed' },
                { icon: Eye,         label: 'Property inspected' },
                { icon: Lock,        label: 'Escrow where available' },
              ].map((m, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs">
                  <m.icon size={19} className="text-sun flex-shrink-0" />
                  <span className="font-semibold leading-tight">{m.label}</span>
                </div>
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10">
              {stats.map((s, i) => <AnimatedStat key={i} value={s.value} suffix={s.suffix} label={s.label} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10">
              {[0,1,2,3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="h-6 w-16 rounded-lg mb-2 bg-white/10" />
                  <div className="h-3 w-20 rounded-lg bg-white/5" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Two doors: "What are you here to do?" ───────────────────── */}
      <section className="pt-20 pb-6 px-5 sm:px-7">
        <div className="max-w-4xl mx-auto">
          <FadeUp>
            <p className="text-center font-display text-3xl sm:text-4xl mb-8" style={{ color: '#17211B' }}>
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
      <section className="py-16 px-5 sm:px-7">
        <div className="max-w-[1184px] mx-auto rounded-[22px] bg-white border border-line p-8 sm:p-12">
          <FadeUp>
            <span className="eyebrow">Clear, not confusing</span>
            <h2 className="mt-3 mb-10 text-3xl sm:text-5xl leading-[1.05] text-deep max-w-2xl">Built for better connections.</h2>
          </FadeUp>
          <StaggerChildren className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: ShieldCheck, title: 'Verified providers', body: 'Find providers who have passed the required verification level.' },
              { icon: Lock,        title: 'Protected contact',  body: 'Where escrow is enabled, contact details remain protected until the required transaction step is completed.' },
              { icon: Handshake,   title: 'Secure payments',    body: 'When a DealMatch transaction uses escrow, payment is handled through the protected transaction flow.' },
            ].map((item, i) => (
              <StaggerItem key={i}>
                <div>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-orange-pale">
                    <item.icon size={22} className="text-terracotta" />
                  </div>
                  <h3 className="text-xl mb-1.5 text-deep">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-deep/65">{item.body}</p>
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
      <section className="py-20 sm:py-24 px-5 sm:px-7 bg-orange-pale text-center">
        <FadeUp>
          <span className="eyebrow">Start with one search</span>
          <h2 className="mt-4 mx-auto max-w-[720px] text-[40px] sm:text-6xl leading-[1.02] text-deep">Your next match is waiting.</h2>
          <p className="mx-auto mt-5 mb-2 max-w-[580px] text-deep/65 leading-relaxed">
            Be among the first to find your match on DealMatch. Free to search, with clear verification on every profile.
          </p>
          <p className="text-sm font-bold mb-8 text-terracotta">Every listing matched, not just posted</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
            <Link to={isAuthenticated ? '/start' : '/auth?tab=signup'} className="inline-flex items-center justify-center gap-2 rounded-full bg-terracotta text-white font-bold px-8 py-4 hover:bg-[#A8441D] transition-colors">
              Join DealMatch <ArrowRight size={16} />
            </Link>
            <Link to="/search" className="btn-outline inline-flex items-center justify-center">Start searching</Link>
          </div>
        </FadeUp>
      </section>
    </div>
  )
}
