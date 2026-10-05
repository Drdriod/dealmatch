import React, { useState, useEffect, useCallback } from 'react'
import { Check, Heart, Home, PartyPopper, RefreshCw, SlidersHorizontal, Star, X } from 'lucide-react'
import SwipeCard from '@/components/matching/SwipeCard'
import { getProperties } from '@/lib/supabase'
import { getAIMatches, explainMatchScore } from '@/lib/pinecone'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import { useAuth } from '@/context/AuthContext'
import PropertyInterestModal from '@/components/ui/PropertyInterestModal'
import clsx from 'clsx'

const FILTERS = ['All','Land','Apartment','Duplex','Terrace','Commercial']

export default function BrowsePage() {
  const { profile } = useAuth()
  const [queue,            setQueue]            = useState([])
  const [filter,           setFilter]           = useState('All')
  const [loading,          setLoading]          = useState(true)
  const [empty,            setEmpty]            = useState(false)

  // FIX: interestProperty was used in JSX but never declared.
  // This caused "ReferenceError: interestProperty is not defined"
  // (Sentry JAVASCRIPT-REACT-9) crashing the entire /browse route.
  const [interestProperty, setInterestProperty] = useState(null)
  const [hasSeenAny,       setHasSeenAny]       = useState(false)

  const loadProperties = useCallback(async () => {
    setLoading(true)
    setEmpty(false)

    // Try real AI matching first - requires a buyer profile with
    // preferences set. Falls back to plain real listings (no score)
    // if the profile is incomplete or the match API is unavailable.
    let scored = []
    const hasProfileForMatching = profile?.budget_min && profile?.budget_max

    if (hasProfileForMatching) {
      const { matches, error } = await getAIMatches(profile)
      if (!error && matches?.length) {
        scored = matches.map(m => ({
          ...m.property,
          matchScore:   Math.round((m.score || 0) * 100),
          matchReasons: explainMatchScore(m.score || 0, m.property, profile),
        }))
      }
    }

    // Fallback: real listings from the database, unscored, if AI
    // matching produced nothing (no profile yet, or API unavailable)
    if (!scored.length) {
      const { data } = await getProperties({ limit: 20 })
      scored = (data || []).map(p => ({ ...p, matchScore: null, matchReasons: [] }))
    }

    if (filter !== 'All') {
      scored = scored.filter(p => p.property_type === filter.toLowerCase())
    }
    if (!scored.length) { setEmpty(true); setLoading(false); return }
    setHasSeenAny(true)
    setQueue(scored)
    setLoading(false)
  }, [filter, profile])

  useEffect(() => { loadProperties() }, [loadProperties])

  const handleSwipe = (action, property) => {
    setQueue(q => {
      const next = q.filter(p => p.id !== property.id)
      if (!next.length) setEmpty(true)
      return next
    })
    // Show interest modal after a "like" or "super" swipe
    if (action === 'like' || action === 'super') {
      setInterestProperty(property)
    }
  }

  return (
    <>
      <div className="min-h-screen pt-20 pb-24" style={{ backgroundColor: '#F5EDE0' }}>
        <div className="max-w-sm mx-auto px-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="font-display text-2xl font-black" style={{ color: '#17211B' }}>
                Browse Deals
              </h1>
              <p className="text-xs mt-0.5" style={{ color: '#647068' }}>
                {queue.length} propert{queue.length === 1 ? 'y' : 'ies'} matching your profile
              </p>
            </div>
            <button onClick={loadProperties}
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(23,33,27,0.08)' }}>
              <RefreshCw size={16} style={{ color: '#5C4A3A' }} />
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto mb-6 pb-1" style={{ scrollbarWidth: 'none' }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition-all flex-shrink-0"
                style={{
                  backgroundColor: filter === f ? '#17211B' : '#FFFFFF',
                  color:           filter === f ? '#FFFFFF'  : '#5C4A3A',
                  borderColor:     filter === f ? '#17211B'  : '#DEDDD6',
                }}>
                {f}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center h-80">
              <div className="text-center">
                <div className="flex justify-center mb-3"><Home size={40} className="text-terracotta animate-bounce" /></div>
                <p className="text-sm" style={{ color: '#647068' }}>Finding your matches...</p>
              </div>
            </div>
          )}

          {/* Empty */}
          {!loading && empty && (
            <div className="rounded-3xl p-10 text-center" style={{ backgroundColor: '#FFFAF5' }}>
              <div className="flex justify-center mb-4">{queue.length === 0 && !hasSeenAny ? <Home size={48} className="text-terracotta" /> : <PartyPopper size={48} className="text-gold" />}</div>
              <h3 className="font-display font-black text-xl mb-2" style={{ color: '#17211B' }}>
                {hasSeenAny ? "You've seen everything!" : 'No listings yet'}
              </h3>
              <p className="text-sm mb-6" style={{ color: '#647068' }}>
                {hasSeenAny
                  ? 'Check your matches or refresh for new listings.'
                  : 'New properties are added regularly. Check back soon, or be the first to list one.'}
              </p>
              <button onClick={loadProperties} className="btn-primary px-8 py-3 text-sm">
                {hasSeenAny ? 'Refresh Listings' : 'Check Again'}
              </button>
            </div>
          )}

          {/* Swipe stack */}
          {!loading && !empty && queue.length > 0 && (
            <div className="relative" style={{ height: 560 }}>
              {queue.slice(0, 3).reverse().map((property, i, arr) => {
                const isTop = i === arr.length - 1
                const scale = 1 - (arr.length - 1 - i) * 0.04
                const y     = (arr.length - 1 - i) * -8
                return (
                  <div key={property.id}
                    className="absolute inset-0"
                    style={{
                      transform: `scale(${scale}) translateY(${y}px)`,
                      transformOrigin: 'bottom center',
                      zIndex: i,
                    }}>
                    {isTop && (
                      <SwipeCard
                        property={property}
                        matchScore={property.matchScore}
                        matchReasons={property.matchReasons}
                        onSwipe={handleSwipe}
                      />
                    )}
                    {!isTop && (
                      <div className="swipe-card w-full h-full opacity-60" />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Swipe hint */}
          {!loading && !empty && queue.length > 0 && (
            <div className="flex items-center justify-center gap-8 mt-6 text-xs" style={{ color: '#647068' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: '#C85F2D', color: '#C85F2D' }}><X size={18} /></div>
                <span>Pass</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: '#D4A853', color: '#D4A853' }}><Star size={18} /></div>
                <span>Super</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: '#7A9E7E', color: '#7A9E7E' }}><Heart size={18} /></div>
                <span>Match</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post-swipe interest modal */}
      {interestProperty && (
        <PropertyInterestModal
          property={interestProperty}
          onClose={() => setInterestProperty(null)}
          onComplete={() => setInterestProperty(null)}
        />
      )}
    </>
  )
}
