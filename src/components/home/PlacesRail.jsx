import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Rail from './Rail'
import PlaceCard from '@/components/cards/PlaceCard'
import { fetchPlacesNearYou } from '@/lib/homeFeed'

export default function PlacesRail() {
  const [places, setPlaces] = useState(null) // null = loading

  useEffect(() => { fetchPlacesNearYou(8).then(setPlaces) }, [])

  // No listings yet: hide the section instead of showing an empty state.
  if (places !== null && places.length === 0) return null

  return (
    <section className="py-10 px-6" style={{ backgroundColor: '#EEE9DE' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display text-3xl" style={{ color: '#17211B' }}>Places near you</h2>
            <p className="text-sm mt-0.5" style={{ color: '#647068' }}>Places and homes worth seeing.</p>
          </div>
          <Link to="/places" className="hidden sm:flex items-center gap-1 text-sm font-semibold flex-shrink-0" style={{ color: '#C85F2D' }}>
            See all <ArrowRight size={13} />
          </Link>
        </div>

        {places === null ? (
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-shrink-0 rounded-3xl overflow-hidden animate-pulse" style={{ width: 260, backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6' }}>
                <div style={{ aspectRatio: '4 / 3', backgroundColor: '#EFE6D8' }} />
                <div className="p-4 space-y-2">
                  <div className="h-3 w-2/3 rounded" style={{ backgroundColor: '#EFE6D8' }} />
                  <div className="h-3 w-1/2 rounded" style={{ backgroundColor: '#EFE6D8' }} />
                </div>
              </div>
            ))}
          </div>
        ) : places.length > 0 ? (
          <Rail>
            {places.map(p => <PlaceCard key={p.id} place={p} />)}
          </Rail>
        ) : null}
      </div>
    </section>
  )
}
