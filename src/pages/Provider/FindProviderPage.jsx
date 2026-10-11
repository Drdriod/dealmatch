import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Search, ShieldCheck, Star, Zap, ChevronRight, Crosshair } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { NIGERIAN_STATES } from '@/lib/location'

const DEFAULT_CATEGORIES = ['artisan', 'tutor', 'home_service', 'other_skill']
const CATEGORY_LABEL = {
  artisan: 'Artisan', tutor: 'Tutor', home_service: 'Home Service',
  other_skill: 'Other Skill', property_professional: 'Property Professional',
}
const CHIPS = [
  { id: 'available', label: 'Recently active' },
  { id: 'rated',     label: 'Highest rated' },
  { id: 'nearby',    label: 'Within 5km' },
]

// Option C (ADR-009): Skill verified (level 2+) is the default view.
// Identity verified (level 1) is an explicit, separate tab.
const TABS = [
  { id: 'skill',    label: 'Skill verified',    minLevel: 2 },
  { id: 'identity', label: 'Identity verified', minLevel: 1 },
]

// Radius in metres. Precise GPS origin allows 5 km; a state centroid origin
// is coarse, so it uses a wider default and "Within 5km" is disabled.
const RADIUS_STATE_M = 50000
const RADIUS_PRECISE_M = 25000
const RADIUS_NEAR_M = 5000

// Maps a profile's free-text state to the canonical state label used by the
// nigeria_state_points view. Mirrors normalise_nigeria_state() in the database.
function canonicalState(raw) {
  if (!raw) return null
  const v = String(raw).trim().toLowerCase()
  if (['fct', 'abuja', 'fct abuja', 'fct (abuja)', 'federal capital territory'].includes(v)) return 'FCT (Abuja)'
  return NIGERIAN_STATES.find(s => s.toLowerCase() === v) || null
}

/**
 * Find a Provider (ADR-009, Option C).
 *
 * Data path: search_providers_rpc (PostGIS radius, server-side paging).
 * Origin: the browser's GPS when the user grants it (precise), otherwise the
 * centroid of a chosen state (approximate). Providers without a location
 * are not returned by the RPC, and the page says so instead of guessing.
 *
 * Tabs: Skill verified (level 2+) by default. Identity verified (level 1)
 * only on its own tab, so clients see each verification level clearly.
 */
export default function FindProviderPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [tab, setTab]                 = useState('skill')
  const [rows, setRows]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [query, setQuery]             = useState('')
  const [activeChips, setActiveChips] = useState([])
  const [activeCategories, setActiveCategories] = useState(DEFAULT_CATEGORIES)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [statePoints, setStatePoints] = useState({})   // { 'Lagos': {lat,lng}, ... }
  const [origin, setOrigin]           = useState(null)  // { lat, lng, label, precise }
  const [locating, setLocating]       = useState(false)

  // Load state centroids once, then choose a default origin from the viewer's state
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('nigeria_state_points').select('state, lat, lng')
      const map = {}
      ;(data || []).forEach(r => { map[r.state] = { lat: r.lat, lng: r.lng } })
      setStatePoints(map)
    })()
  }, [])

  useEffect(() => {
    if (origin?.precise) return
    const key = canonicalState(profile?.state)
    if (key && statePoints[key]) {
      setOrigin({ ...statePoints[key], label: key, precise: false })
    }
  }, [profile?.state, statePoints]) // eslint-disable-line react-hooks/exhaustive-deps

  const radiusM = origin?.precise ? RADIUS_PRECISE_M : RADIUS_STATE_M
  const minLevel = TABS.find(t => t.id === tab)?.minLevel ?? 2

  // Query the RPC whenever the origin or the tab changes
  useEffect(() => {
    if (!origin) { setRows([]); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: hits, error } = await supabase.rpc('search_providers_rpc', {
        client_lat: origin.lat,
        client_lng: origin.lng,
        radius_m: activeChips.includes('nearby') && origin.precise ? RADIUS_NEAR_M : radiusM,
        min_level: minLevel,
        page_limit: 50,
        page_offset: 0,
      })
      if (cancelled) return
      if (error || !hits?.length) { setRows([]); setLoading(false); return }

      const ids = hits.map(h => h.user_id)
      const [{ data: vp }, { data: profiles }, { data: stats }] = await Promise.all([
        supabase.from('verified_providers').select('user_id, level, level_data, updated_at').in('user_id', ids),
        supabase.from('public_profiles').select('id, full_name, avatar_url, city, state, bio').in('id', ids),
        supabase.from('provider_stats').select('provider_id, review_count, avg_rating, completion_rate').in('provider_id', ids),
      ])
      if (cancelled) return

      const merged = hits.map(h => {
        const v = vp?.find(x => x.user_id === h.user_id) || {}
        const p = profiles?.find(x => x.id === h.user_id)
        const s = stats?.find(x => x.provider_id === h.user_id)
        return {
          id: h.user_id,
          level: h.level,
          name: p?.full_name || 'DealMatch provider',
          avatar: p?.avatar_url,
          city: p?.city, state: p?.state,
          bio: p?.bio,
          categoryType: v.level_data?.category_type || 'other_skill',
          category: v.level_data?.category || null,
          area: v.level_data?.area || null,
          openPrice: v.level_data?.open_price !== false,
          priceCents: v.level_data?.price_cents || null,
          rating: s?.avg_rating || h.bayesian_rating || null,
          reviewCount: s?.review_count || h.rating_count || 0,
          completionRate: s?.completion_rate != null ? Math.round(s.completion_rate * 100) : null,
          distanceKm: h.distance_m != null ? Math.round(h.distance_m / 100) / 10 : null,
          locationPrecision: h.location_precision,
          recentlyActive: v.updated_at && (Date.now() - new Date(v.updated_at).getTime()) < 14 * 24 * 3600 * 1000,
        }
      })
      setRows(merged)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [origin?.lat, origin?.lng, origin?.precise, minLevel, radiusM, activeChips.includes('nearby')]) // eslint-disable-line react-hooks/exhaustive-deps

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Your location', precise: true })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  const pickState = (label) => {
    if (!label) return
    const pt = statePoints[label]
    if (pt) setOrigin({ ...pt, label, precise: false })
  }

  const toggleChip = (id) => {
    if (id === 'nearby' && !origin?.precise) return   // needs a precise origin
    setActiveChips(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])
  }
  const toggleCategory = (id) => setActiveCategories(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  const filtered = useMemo(() => {
    let list = [...rows]
    // Identity tab shows only level 1; Skill tab shows level 2 and above
    list = tab === 'identity' ? list.filter(p => p.level === 1) : list.filter(p => p.level >= 2)
    list = list.filter(p => activeCategories.includes(p.categoryType))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.bio?.toLowerCase().includes(q))
    }
    if (activeChips.includes('available')) list = list.filter(p => p.recentlyActive)
    if (activeChips.includes('rated')) list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    else list = [...list].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    return list
  }, [rows, tab, query, activeChips, activeCategories])

  const originText = origin
    ? (origin.precise ? 'your location' : origin.label)
    : null

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F7F4ED' }}>
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3" style={{ backgroundColor: '#F7F4ED', borderBottom: '1px solid #DEDDD6' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FFF' }}>
            <ArrowLeft size={16} style={{ color: '#17211B' }} />
          </button>
          <div>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }} className="font-display text-lg font-black" style={{ color: '#17211B' }}>Find a Provider</motion.h1>
            <p className="text-xs" style={{ color: '#647068' }}>Nearest verified providers first</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={tab === t.id
                ? { backgroundColor: '#17211B', color: '#FFF' }
                : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #DEDDD6' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl mb-3" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
          <Search size={15} style={{ color: '#647068' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="What do you need done?"
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: '#17211B' }} />
        </div>

        <div className="flex gap-2 mb-3">
          <select value={origin?.precise ? '' : (origin?.label || '')} onChange={e => pickState(e.target.value)}
            className="flex-1 px-3 py-2 rounded-full text-xs font-semibold outline-none"
            style={{ backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #DEDDD6' }}
            aria-label="Choose a state">
            <option value="">Choose a state</option>
            {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={useMyLocation} disabled={locating}
            className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 disabled:opacity-60"
            style={origin?.precise
              ? { backgroundColor: '#C85F2D', color: '#FFF' }
              : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #DEDDD6' }}>
            <Crosshair size={12} /> {locating ? 'Locating…' : 'Use my location'}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2">
          {DEFAULT_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => toggleCategory(cat)}
              className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={activeCategories.includes(cat)
                ? { backgroundColor: '#17211B', color: '#FFF' }
                : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #DEDDD6' }}>
              {CATEGORY_LABEL[cat]}
            </button>
          ))}
          <button onClick={() => setShowAdvanced(s => !s)}
            className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0"
            style={{ backgroundColor: 'transparent', color: '#647068', border: '1px dashed #C9BBAE' }}>
            {showAdvanced ? 'Hide advanced' : 'Advanced ▾'}
          </button>
        </div>
        {showAdvanced && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
            <button onClick={() => toggleCategory('property_professional')}
              className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={activeCategories.includes('property_professional')
                ? { backgroundColor: '#C85F2D', color: '#FFF' }
                : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #DEDDD6' }}>
              {CATEGORY_LABEL.property_professional}
            </button>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {CHIPS.map(chip => {
            const disabled = chip.id === 'nearby' && !origin?.precise
            return (
              <button key={chip.id} onClick={() => toggleChip(chip.id)} disabled={disabled}
                title={disabled ? 'Use my location to filter within 5 km' : undefined}
                className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors disabled:opacity-40"
                style={activeChips.includes(chip.id)
                  ? { backgroundColor: '#C85F2D', color: '#FFF' }
                  : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #DEDDD6' }}>
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      {origin && !loading && (
        <div className="mx-4 mt-4 rounded-2xl flex items-center justify-center gap-2 text-xs px-4 py-3 text-center" style={{ backgroundColor: '#F0E5D8', color: '#647068' }}>
          <MapPin size={14} />
          {filtered.length} provider{filtered.length === 1 ? '' : 's'} within {origin.precise ? (activeChips.includes('nearby') ? '5 km' : '25 km') : '50 km'} of {originText}
          {!origin.precise && <span> · showing approximate state distance</span>}
        </div>
      )}

      <div className="px-4 mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
        {!origin && !loading ? (
          <div className="col-span-full text-center py-16">
            <MapPin size={36} className="mx-auto mb-3" style={{ color: '#D8C9B8' }} />
            <p className="text-sm font-semibold" style={{ color: '#17211B' }}>Choose a state or use your location</p>
            <p className="text-xs mt-1" style={{ color: '#647068' }}>We show providers near you first.</p>
          </div>
        ) : loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 rounded-3xl animate-pulse" style={{ backgroundColor: '#F0E5D8' }} />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <ShieldCheck size={36} className="mx-auto mb-3" style={{ color: '#D8C9B8' }} />
            <p className="text-sm font-semibold" style={{ color: '#17211B' }}>No providers match yet</p>
            <p className="text-xs mt-1" style={{ color: '#647068' }}>
              {tab === 'identity'
                ? 'Identity-verified providers appear here. Try another state, or check the Skill verified tab.'
                : 'Try clearing filters, or post a job and let providers come to you.'}
            </p>
            <button onClick={() => navigate('/request?mode=bid')} className="btn-primary mt-4 px-6 py-2.5 text-sm">Post a request instead</button>
          </div>
        ) : filtered.map(p => (
          <motion.div key={p.id}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
            whileHover={{ y: -4 }} transition={{ duration: 0.35 }}
            className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', boxShadow: '0 4px 24px rgba(23,33,27,0.06)' }}>
            <div className="h-40 relative" style={{ backgroundColor: '#F0D4BE' }}>
              {p.avatar
                ? <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(200,95,45,0.15), rgba(122,158,126,0.15))' }}>
                    <span className="font-display text-3xl font-black" style={{ color: '#C85F2D' }}>{p.name?.[0] || '?'}</span>
                  </div>}
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: '#3D7A45', color: '#FFFFFF' }}>
                {p.level >= 3 ? 'Trusted' : p.level === 2 ? 'Skill verified' : 'Identity verified'}
              </div>
              {p.recentlyActive && (
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1"
                  style={{ backgroundColor: 'rgba(26,20,16,0.55)', color: '#FFFFFF', backdropFilter: 'blur(4px)' }}>
                  <Zap size={9} /> Active
                </div>
              )}
            </div>

            <div className="p-5">
              <p className="font-display font-black text-base mb-1" style={{ color: '#17211B' }}>{p.name}</p>
              {p.category && (
                <p className="text-xs font-semibold mb-1" style={{ color: '#C85F2D' }}>{p.category}</p>
              )}
              <div className="flex items-center gap-1.5 text-xs mb-2 flex-wrap" style={{ color: '#647068' }}>
                {(p.area || p.city || p.state) && <span className="flex items-center gap-1"><MapPin size={11} style={{ color: '#C85F2D' }} /> {p.area || p.city || p.state}</span>}
                {p.distanceKm != null && <span className="ml-1">{p.distanceKm} km</span>}
                {p.rating != null && <span className="flex items-center gap-1 ml-1"><Star size={11} className="fill-current" style={{ color: '#D4A853' }} /> {p.rating} ({p.reviewCount})</span>}
              </div>
              <p className="text-xs font-bold mb-3" style={{ color: '#17211B' }}>
                {p.openPrice || !p.priceCents ? 'Open price' : `From ₦${(p.priceCents / 100).toLocaleString()}`}
              </p>

              <div className="flex gap-2">
                <button onClick={() => navigate(`/request?mode=bid&provider=${p.id}`)}
                  className="flex-1 py-2.5 rounded-full text-xs font-bold" style={{ backgroundColor: 'rgba(200,95,45,0.1)', color: '#C85F2D' }}>
                  Request Bid
                </button>
                <button onClick={() => navigate(`/provider/${p.id}`)}
                  className="flex-1 py-2.5 rounded-full text-xs font-bold text-white flex items-center justify-center gap-1" style={{ backgroundColor: '#C85F2D' }}>
                  View <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
