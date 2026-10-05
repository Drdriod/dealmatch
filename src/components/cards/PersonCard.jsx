import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Lock, MapPin, ShieldCheck } from 'lucide-react'

/**
 * Person card - same visual language and information order as PlaceCard,
 * for the same reason PlaceCard exists: photo first, one line each after.
 *
 * `person` shape: { id, name, avatar, area, category, trusted, openPrice,
 * priceCents } (see fetchPeopleNearYou in @/lib/homeFeed).
 *
 * Deliberately sourced only from verified_providers (level >= 2, the real
 * Skill Verified path) - never the separate catalog/category_listings
 * artisan schema, and never the paid property-professional vertical. Every
 * card this renders is a real, identity + skill verified person.
 *
 * "Phone locked" is unconditional for the same reason as PlaceCard: contact
 * only reveals once escrow is funded on an actual request, never before.
 */
export default function PersonCard({ person }) {
  if (!person) return null
  const price = !person.openPrice && person.priceCents ? `From ₦${(person.priceCents / 100).toLocaleString()}` : 'Open price'

  return (
    <Link
      to={`/provider/${person.id}`}
      className="group flex-shrink-0 block rounded-[19px] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-card-hover"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6', width: 260 }}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
        {person.avatar ? (
          <img src={person.avatar} alt={person.name} loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(200,95,45,0.15), rgba(122,158,126,0.15))' }}>
            <span className="font-display text-3xl font-black" style={{ color: '#C85F2D' }}>{person.name?.[0] || '?'}</span>
          </div>
        )}
        <div className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: person.trusted ? '#234C3A' : 'rgba(23,33,27,0.75)', color: '#FFFFFF', backdropFilter: 'blur(4px)' }}>
          <ShieldCheck size={11} /> {person.trusted ? 'Trusted' : 'Verified'}
        </div>
      </div>

      <div className="p-4">
        <p className="font-display font-black text-sm mb-1 truncate" style={{ color: '#17211B' }}>{person.name}</p>
        {person.category && (
          <p className="text-xs font-semibold mb-1 truncate" style={{ color: '#C85F2D' }}>{person.category}</p>
        )}
        {person.area && (
          <div className="flex items-center gap-1 text-xs mb-2" style={{ color: '#647068' }}>
            <MapPin size={11} style={{ color: '#C85F2D' }} />
            <span className="truncate">{person.area}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="font-black text-sm" style={{ color: '#C85F2D' }}>{price}</p>
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#647068' }}>
            <Lock size={10} /> Phone locked
          </span>
        </div>
        <p className="mt-2 text-xs font-bold flex items-center gap-1" style={{ color: '#17211B' }}>
          View profile <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
        </p>
      </div>
    </Link>
  )
}
