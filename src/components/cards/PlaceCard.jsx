import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Home, Lock, MapPin, ShieldCheck, ArrowRight } from 'lucide-react'

// Link with a spring lift on hover and a slight press on tap.
const MotionLink = motion.create(Link)
const cardMotion = {
  whileHover: { y: -4 },
  whileTap: { scale: 0.985 },
  transition: { type: 'spring', stiffness: 420, damping: 30 },
}

const formatPrice = (n) => {
  if (!n) return null
  return `₦${Number(n).toLocaleString()}`
}

/**
 * Place card - photo occupies the majority of the card, everything else is
 * one line each. Per the card philosophy: what is it, where is it, can I
 * trust it, what do I do next - nothing more.
 *
 * `place` shape: { id, title, image, area, price, priceUnit, verified }
 * (see fetchPlacesNearYou in @/lib/homeFeed for how this is produced).
 *
 * "Phone locked" is not conditional - it's always true for every listing
 * on DealMatch (contact only reveals once escrow is funded on a specific
 * deal), so it renders unconditionally rather than reading a per-card flag.
 */
export default function PlaceCard({ place }) {
  if (!place) return null
  const price = formatPrice(place.price)

  return (
    <MotionLink
      to={`/property/${place.id}`}
      {...cardMotion}
      className="group flex-shrink-0 block rounded-[19px] overflow-hidden transition-shadow hover:shadow-card-hover"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6', width: 260 }}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
        {place.image ? (
          <img src={place.image} alt={place.title} loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'rgba(200,95,45,0.08)' }}>
            <Home size={32} style={{ color: '#C85F2D' }} />
          </div>
        )}
        {place.verified && (
          <div className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={{ backgroundColor: 'rgba(255,255,255,0.94)', color: '#17211B', backdropFilter: 'blur(4px)' }}>
            <ShieldCheck size={11} /> Verified
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="font-display font-black text-sm mb-1 truncate" style={{ color: '#17211B' }}>{place.title}</p>
        {place.area && (
          <div className="flex items-center gap-1 text-xs mb-2" style={{ color: '#647068' }}>
            <MapPin size={11} style={{ color: '#C85F2D' }} />
            <span className="truncate">{place.area}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          {price ? (
            <p className="font-black text-sm" style={{ color: '#C85F2D' }}>
              {price}<span className="text-xs font-normal" style={{ color: '#647068' }}> {place.priceUnit || ''}</span>
            </p>
          ) : <span />}
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#647068' }}>
            <Lock size={10} /> Phone locked
          </span>
        </div>
        <p className="mt-2 text-xs font-bold flex items-center gap-1" style={{ color: '#17211B' }}>
          View place <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
        </p>
      </div>
    </MotionLink>
  )
}
