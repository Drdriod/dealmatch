import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Rail from './Rail'
import PlaceCard from '@/components/cards/PlaceCard'
import { fetchPlacesNearYou } from '@/lib/homeFeed'

export default function PlacesRail() {
  const [places, setPlaces] = useState(null) // null = loading

  useEffect(() => { fetchPlacesNearYou(8).then(setPlaces) }, [])

  return (
    <section className="py-10 px-6" style={{ backgroundColor: '#F8F1E9' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl font-black" style={{ color: '#1A1A1A' }}>Places near you</h2>
            <p className="text-sm mt-0.5" style={{ color: '#8A7E78' }}>Shortlets and homes worth seeing.</p>
          </div>
          <Link to="/places" className="hidden sm:flex items-center gap-1 text-sm font-semibold flex-shrink-0" style={{ color: '#C45C26' }}>
            See all <ArrowRight size={13} />
          </Link>
        </div>

        {places === null ? (
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-shrink-0 rounded-3xl overflow-hidden animate-pulse" style={{ width: 260, backgroundColor: '#FFFFFF', border: '1px solid #E9DECF' }}>
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
        ) : (
          // Functional empty state, not a dead end: one photo of the room
          // we want (placeholder for now, see PhotoPlaceholder) + a real,
          // working "List a place" CTA - per instruction, this must work
          // today, not be a stub to come back to.
          <div className="rounded-3xl overflow-hidden flex flex-col sm:flex-row" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E9DECF' }}>
            <div className="sm:w-64 flex-shrink-0" style={{ aspectRatio: '4 / 3' }}>
              {/* "The room we want" - real reference photo, not the
                  generic gradient placeholder, per the brief's Places-row
                  empty-state spec. */}
              <img src="/home/places-empty-room.webp" alt="" className="w-full h-full object-cover" />
            </div>
            <div className="p-6 flex flex-col justify-center">
              <p className="font-display font-black text-lg mb-1" style={{ color: '#1A1A1A' }}>No places listed here yet</p>
              <p className="text-sm mb-4" style={{ color: '#8A7E78' }}>Be the first to list a shortlet or house rent in Uyo.</p>
              <Link to="/list-rental" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold self-start"
                style={{ backgroundColor: '#C45C26', color: '#FFFFFF' }}>
                List a place <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
