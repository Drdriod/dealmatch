import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Hotel, ShieldCheck, Truck, Wrench } from 'lucide-react'

/**
 * WhatIsDealMatchCarousel: the four-category flip-card grid on the
 * homepage. Front face is neutral: white card, dark ink text, thin
 * border. No color, the category identity comes from the icon, title
 * and description alone, with type doing the work. Back face keeps
 * the trust-badge treatment: a real photo (or dark fallback) with the
 * "Verified" line.
 */
const CATEGORY_CARDS = [
  {
    id: 'real-estate', to: '/browse', usesPhoto: true, flipDelay: 0,
    icon: Building2, title: 'Real Estate',
    desc: 'Buy, sell, or find your next home.',
    backLabel: 'Verified listings, physically inspected',
  },
  {
    id: 'rentals', to: '/places', usesPhoto: true, flipDelay: 900,
    icon: Hotel, title: 'Rentals & Shortlets',
    desc: 'Annual leases or a few nights away.',
    backLabel: 'Long-term and short-stay, one place',
  },
  {
    id: 'artisans', to: '/providers', usesPhoto: false, flipDelay: 1800,
    icon: Wrench, title: 'Skilled Artisans & Services',
    desc: 'Plumbers, electricians, tailors, and more.',
    backLabel: 'Identity + skill verified, rated, nearby',
  },
  {
    id: 'automotive', to: '/marketplace/automotive', usesPhoto: false, flipDelay: 2700,
    icon: Truck, title: 'Automotive',
    desc: 'Vehicles, parts, and transport services.',
    backLabel: 'From trusted, verified sellers',
  },
]

function FlipCard({ card, photo, index }) {
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    const start = setTimeout(() => {
      const interval = setInterval(() => setFlipped(f => !f), 3600)
      return () => clearInterval(interval)
    }, card.flipDelay)
    return () => clearTimeout(start)
  }, [card.flipDelay])

  return (
    <Link to={card.to} className="block" style={{ perspective: '1200px' }}>
      <div
        className="relative rounded-3xl transition-transform duration-700"
        style={{ height: 210, transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front face - neutral: white card, dark text, no color */}
        <div
          className="absolute inset-0 rounded-3xl p-5 flex flex-col justify-between overflow-hidden"
          style={{ backfaceVisibility: 'hidden', backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6' }}
        >
          <card.icon size={26} style={{ color: '#17211B' }} strokeWidth={1.6} />
          <div>
            <h3 className="font-display text-lg font-black leading-tight mb-1" style={{ color: '#17211B' }}>
              {card.title}
            </h3>
            <p className="text-xs max-w-[70%] mb-3" style={{ color: '#536058' }}>{card.desc}</p>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#17211B' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5"><path d="M7 17L17 7M17 7H8M17 7V16" /></svg>
            </div>
          </div>
        </div>

        {/* Back face - unchanged trust treatment */}
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {photo ? (
            <>
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${photo})` }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(23,33,27,0.85) 0%, rgba(23,33,27,0.35) 60%, rgba(23,33,27,0.15) 100%)' }} />
            </>
          ) : (
            <div className="absolute inset-0" style={{ backgroundColor: '#17211B' }} />
          )}
          <div className="relative h-full p-5 flex flex-col justify-end">
            <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1" style={{ color: '#DEDDD6' }}>
              <ShieldCheck size={12} /> Verified
            </div>
            <p className="text-white text-sm font-semibold leading-snug">{card.backLabel}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function WhatIsDealMatchCarousel({ properties = [] }) {
  const propertyPhoto = (() => {
    const withImage = properties.find(p => p.images?.length > 0)
    if (!withImage) return null
    return withImage.images.find(i => i?.is_primary)?.url || withImage.images[0]?.url
  })()

  return (
    <section className="py-14 px-6" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="max-w-2xl mx-auto text-center mb-8">
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#536058' }}>
          What's on DealMatch
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-black" style={{ color: '#17211B' }}>
          One platform. Multi-category matching.
        </h2>
      </div>

      <div className="max-w-lg mx-auto grid grid-cols-2 gap-3">
        {CATEGORY_CARDS.map((card, i) => (
          <FlipCard key={card.id} card={card} photo={card.usesPhoto ? propertyPhoto : null} index={i} />
        ))}
      </div>
    </section>
  )
}
