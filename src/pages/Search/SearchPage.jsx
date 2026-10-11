import React, { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { MapPin, Search as SearchIcon, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { universalSearch } from '@/modules/search/searchService'
import { aiMatchListings } from '@/modules/matching/matchingService'
import { useUserLocation } from '@/hooks/useUserLocation'

const formatPrice = (cents) => {
  if (cents == null) return null
  const n = Number(cents) / 100
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`
  return `₦${Math.round(n)}`
}

const SOURCE_LABEL = {
  category_listings: 'Service / Listing',
  properties: 'Place',
  student_hostels: 'Student Hostel',
  professionals: 'Professional',
}

/**
 * The one real universal search page (item 4 / item 7-a of the fix
 * request). Replaces HeroSearch's old "guess places vs providers by
 * keyword" routing - this page federates across every vertical
 * (category_listings i.e. every people+places service, properties,
 * student_hostels, professionals) via the existing universal_search()
 * Postgres function, and additionally cross-checks against the AI/location
 * match endpoint for the "people & places" category_listings rows when a
 * location is available, so results aren't just keyword-ranked but also
 * distance-aware. See src/modules/matching/matchingService.js:aiMatchListings.
 */
export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const [inputValue, setInputValue] = useState(q)
  const [results, setResults] = useState(null) // null = not searched yet
  const [aiResults, setAiResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [radiusKm, setRadiusKm] = useState(15)
  const { coords, requestLocation, status: locStatus } = useUserLocation()

  const runSearch = useCallback(async (text) => {
    if (!text.trim()) { setResults([]); setAiResults([]); return }
    setLoading(true)
    try {
      const [keywordResults, semanticResults] = await Promise.all([
        universalSearch(supabase, text, { limit: 40 }),
        // AI/location matching is best-effort - if Pinecone isn't
        // configured (no PINECONE_API_KEY set), this
        // resolves to [] rather than blocking keyword search.
        aiMatchListings({
          queryText: text,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          radiusMeters: radiusKm * 1000,
        }).catch(() => []),
      ])
      setResults(keywordResults || [])
      setAiResults(semanticResults || [])
    } catch (err) {
      console.error('SearchPage search failed:', err.message)
      setResults([])
      setAiResults([])
    } finally {
      setLoading(false)
    }
  }, [coords, radiusKm])

  useEffect(() => { if (q) runSearch(q) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => {
    e.preventDefault()
    setParams(inputValue ? { q: inputValue } : {})
    runSearch(inputValue)
  }

  // Merge: AI/semantic matches for category_listings are shown first when
  // present (they carry a distance-aware relevance score), de-duplicated
  // against the keyword results by item_id so nothing appears twice.
  const aiIds = new Set(aiResults.map(r => String(r.id)))
  const keywordOnly = (results || []).filter(r => !(r.source === 'category_listings' && aiIds.has(r.item_id)))

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#EEE9DE' }}>
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="font-display text-2xl font-black mb-1" style={{ color: '#17211B' }}>Search DealMatch</h1>
        <p className="text-xs mb-5" style={{ color: '#647068' }}>
          One search across every place and person on the platform.
        </p>

        <form onSubmit={submit} className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <SearchIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#647068' }} />
            <input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Find a shortlet, a plumber, house rent, a tutor..."
              className="w-full pl-11 pr-4 py-3.5 rounded-full text-sm outline-none"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6', color: '#17211B' }}
            />
          </div>
          <button type="submit" className="px-6 py-3.5 rounded-full text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: '#C85F2D', color: '#FFFFFF' }}>
            Search
          </button>
        </form>

        <div className="flex items-center gap-3 mb-6">
          <button type="button" onClick={requestLocation}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ backgroundColor: coords ? 'rgba(122,158,126,0.15)' : 'rgba(0,0,0,0.05)', color: coords ? '#4F7A54' : '#5C4A3A' }}>
            <MapPin size={12} />
            {coords ? 'Using your location' : locStatus === 'requesting' ? 'Locating...' : 'Search near me'}
          </button>
          {coords && (
            <label className="flex items-center gap-2 text-xs" style={{ color: '#647068' }}>
              <SlidersHorizontal size={12} /> Within
              <select value={radiusKm} onChange={e => setRadiusKm(Number(e.target.value))}
                className="text-xs rounded-lg px-1.5 py-1" style={{ border: '1px solid #DEDDD6', background: '#fff' }}>
                {[5, 10, 15, 25, 50].map(km => <option key={km} value={km}>{km} km</option>)}
              </select>
            </label>
          )}
        </div>

        {loading && <p className="text-sm" style={{ color: '#647068' }}>Searching...</p>}

        {!loading && results !== null && aiResults.length === 0 && keywordOnly.length === 0 && (
          <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
            <p className="font-semibold text-sm mb-1" style={{ color: '#17211B' }}>No matches yet</p>
            <p className="text-xs" style={{ color: '#647068' }}>Try a different word, or broaden your radius.</p>
          </div>
        )}

        {aiResults.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#C85F2D' }}>
              Best matches {coords ? '(AI + location matched)' : '(AI matched)'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {aiResults.map(r => (
                <Link key={r.id} to={r.url_path || `/listing/${r.id}`}
                  className="block rounded-2xl p-4"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm" style={{ color: '#17211B' }}>{r.title}</p>
                    {typeof r.score === 'number' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: 'rgba(200,95,45,0.1)', color: '#C85F2D' }}>
                        {Math.round(r.score * 100)}% match
                      </span>
                    )}
                  </div>
                  {r.location_name && <p className="text-xs mb-1 flex items-center gap-1" style={{ color: '#647068' }}><MapPin size={10} />{r.location_name}</p>}
                  {formatPrice(r.price_cents) && <p className="text-sm font-bold" style={{ color: '#C85F2D' }}>{formatPrice(r.price_cents)}</p>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {keywordOnly.length > 0 && (
          <div>
            {aiResults.length > 0 && <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#647068' }}>More results</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {keywordOnly.map(r => (
                <motion.div key={`${r.source}-${r.item_id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Link to={r.url_path} className="block rounded-2xl p-4"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(0,0,0,0.05)', color: '#5C4A3A' }}>
                        {SOURCE_LABEL[r.source] || r.category_name}
                      </span>
                    </div>
                    <p className="font-semibold text-sm mb-1" style={{ color: '#17211B' }}>{r.title}</p>
                    {r.location_name && <p className="text-xs mb-1 flex items-center gap-1" style={{ color: '#647068' }}><MapPin size={10} />{r.location_name}</p>}
                    {formatPrice(r.price_cents) && <p className="text-sm font-bold" style={{ color: '#C85F2D' }}>{formatPrice(r.price_cents)}</p>}
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
