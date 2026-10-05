import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Award } from 'lucide-react'
import Rail from './Rail'
import PersonCard from '@/components/cards/PersonCard'
import { fetchPeopleNearYou } from '@/lib/homeFeed'

export default function PeopleRail() {
  const [people, setPeople] = useState(null) // null = loading

  useEffect(() => { fetchPeopleNearYou(8).then(setPeople) }, [])

  return (
    <section className="py-10 px-6" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display text-3xl" style={{ color: '#17211B' }}>People near you</h2>
            <p className="text-sm mt-0.5" style={{ color: '#647068' }}>Skilled people ready to help.</p>
          </div>
          <Link to="/providers" className="hidden sm:flex items-center gap-1 text-sm font-semibold flex-shrink-0" style={{ color: '#C85F2D' }}>
            See all <ArrowRight size={13} />
          </Link>
        </div>

        {people === null ? (
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-shrink-0 rounded-3xl overflow-hidden animate-pulse" style={{ width: 260, backgroundColor: '#EEE9DE', border: '1px solid #DEDDD6' }}>
                <div style={{ aspectRatio: '4 / 3', backgroundColor: '#EFE6D8' }} />
                <div className="p-4 space-y-2">
                  <div className="h-3 w-2/3 rounded" style={{ backgroundColor: '#EFE6D8' }} />
                  <div className="h-3 w-1/2 rounded" style={{ backgroundColor: '#EFE6D8' }} />
                </div>
              </div>
            ))}
          </div>
        ) : people.length > 0 ? (
          <Rail>
            {people.map(p => <PersonCard key={p.id} person={p} />)}
          </Rail>
        ) : (
          // Functional empty state - a real, working "Offer a skill" CTA,
          // not a placeholder to come back and wire up later.
          <div className="rounded-3xl p-8 flex flex-col sm:flex-row sm:items-center gap-5" style={{ backgroundColor: '#EEE9DE', border: '1px solid #DEDDD6' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(200,95,45,0.12)' }}>
              <Award size={26} style={{ color: '#C85F2D' }} />
            </div>
            <div className="flex-1">
              <p className="font-display font-black text-lg mb-1" style={{ color: '#17211B' }}>No verified people here yet</p>
              <p className="text-sm" style={{ color: '#647068' }}>Artisan, tutor, home service - offer your skill and get discovered.</p>
            </div>
            <Link to="/verify-skill" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: '#C85F2D', color: '#FFFFFF' }}>
              Offer a skill <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
