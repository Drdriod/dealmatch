import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Search, ShieldCheck, Star, Zap, Award, ChevronRight, Map as MapIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

const DEFAULT_CATEGORIES = ['artisan', 'tutor', 'home_service', 'other_skill']
const CATEGORY_LABEL = {
  artisan: 'Artisan', tutor: 'Tutor', home_service: 'Home Service',
  other_skill: 'Other Skill', property_professional: 'Property Professional',
}
const CHIPS = [
  { id: 'available', label: 'Available now' },
  { id: 'rated',     label: 'Highest rated' },
  { id: 'nearby',    label: 'Within 5km' },
]

const LEVEL_LABEL = { 0: null, 1: 'Identity Verified', 2: 'Skill Verified', 3: 'Trusted' }

/**
 * "Find Nearest Available Verified Provider" (handoff spec 3.2 / gap
 * analysis 3.3). Card order deliberately matches the spec: Identity ->
 * Badge -> Distance/Rating -> Price -> dual CTA (Request Now / View
 * Profile).
 *
 * Data model note: there is no dedicated `provider` role in
 * profiles.role's CHECK constraint (buyer/seller/renter/landlord/agent/
 * investor/student/verifier/admin/superadmin only) -- being a provider is
 * orthogonal to that: any account becomes one by getting a
 * verified_providers row. Per ADR-008, Level 2 (Skill Verified) is
 * required to appear in matching/search, so this only lists level >= 2
 * providers -- Level 1 (Identity only) can transact if directly invited
 * but doesn't surface here, matching the ladder's own stated rule.
 *
 * "Within 5km" is approximated by city/state match rather than a true
 * PostGIS radius: profiles has no lat/lng column today (only
 * city/state/location text). Flagged in PRODUCTION_HANDOFF.md as a
 * follow-up (add geography column + PostGIS index, same pattern
 * properties/category_listings already use) rather than silently faked.
 */
export default function FindProviderPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [providers, setProviders] = useState([])
  const [loading, setLoading]     = useState(true)
  const [query, setQuery]         = useState('')
  const [activeChips, setActiveChips] = useState([])
  // Property professionals (surveyors/agents/inspectors/valuers) are an
  // advanced filter, not the default per spec - start with just the four
  // Skilled People categories selected.
  const [activeCategories, setActiveCategories] = useState(DEFAULT_CATEGORIES)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data: vp } = await supabase
        .from('verified_providers')
        .select('user_id, level, level_data, updated_at')
        .gte('level', 2)
        .order('level', { ascending: false })

      if (!vp?.length) { setProviders([]); setLoading(false); return }

      const ids = vp.map(v => v.user_id)
      const [{ data: profiles }, { data: stats }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, city, state, bio').in('id', ids),
        supabase.from('provider_stats').select('provider_id, review_count, avg_rating, completion_rate').in('provider_id', ids),
      ])

      const merged = vp.map(v => {
        const p = profiles?.find(x => x.id === v.user_id)
        const s = stats?.find(x => x.provider_id === v.user_id)
        return {
          id: v.user_id,
          level: v.level,
          name: p?.full_name || 'DealMatch provider',
          avatar: p?.avatar_url,
          city: p?.city, state: p?.state,
          bio: p?.bio,
          categoryType: v.level_data?.category_type || 'other_skill',
          category: v.level_data?.category || null,
          area: v.level_data?.area || null,
          openPrice: v.level_data?.open_price !== false,
          priceCents: v.level_data?.price_cents || null,
          rating: s?.avg_rating || null,
          reviewCount: s?.review_count || 0,
          completionRate: s?.completion_rate != null ? Math.round(s.completion_rate * 100) : null,
          recentlyActive: v.updated_at && (Date.now() - new Date(v.updated_at).getTime()) < 14 * 24 * 3600 * 1000,
        }
      })
      setProviders(merged)
      setLoading(false)
    })()
  }, [])

  const toggleChip = (id) => setActiveChips(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])
  const toggleCategory = (id) => setActiveCategories(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  const filtered = useMemo(() => {
    let list = [...providers]
    list = list.filter(p => activeCategories.includes(p.categoryType))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.bio?.toLowerCase().includes(q))
    }
    if (activeChips.includes('available')) list = list.filter(p => p.recentlyActive)
    if (activeChips.includes('nearby') && profile?.city) list = list.filter(p => p.city === profile.city)
    if (activeChips.includes('rated')) list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    else list = [...list].sort((a, b) => b.level - a.level || (b.rating || 0) - (a.rating || 0))
    return list
  }, [providers, query, activeChips, activeCategories, profile])

  const mapPins = filtered.filter(p => p.city).slice(0, 20)

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#FAF6F0' }}>
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3" style={{ backgroundColor: '#FAF6F0', borderBottom: '1px solid #E8DDD2' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FFF' }}>
            <ArrowLeft size={16} style={{ color: '#1A1210' }} />
          </button>
          <div>
            <h1 className="font-display text-lg font-black" style={{ color: '#1A1210' }}>Find a Provider</h1>
            <p className="text-xs" style={{ color: '#8A7E78' }}>Nearest available, verified first</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl mb-3" style={{ backgroundColor: '#FFF', border: '1px solid #E8DDD2' }}>
          <Search size={15} style={{ color: '#8A7E78' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="What do you need done?"
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: '#1A1210' }} />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2">
          {DEFAULT_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => toggleCategory(cat)}
              className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={activeCategories.includes(cat)
                ? { backgroundColor: '#1A1210', color: '#FFF' }
                : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #E8DDD2' }}>
              {CATEGORY_LABEL[cat]}
            </button>
          ))}
          <button onClick={() => setShowAdvanced(s => !s)}
            className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0"
            style={{ backgroundColor: 'transparent', color: '#8A7E78', border: '1px dashed #C9BBAE' }}>
            {showAdvanced ? 'Hide advanced' : 'Advanced ▾'}
          </button>
        </div>
        {showAdvanced && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
            <button onClick={() => toggleCategory('property_professional')}
              className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={activeCategories.includes('property_professional')
                ? { backgroundColor: '#C45C26', color: '#FFF' }
                : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #E8DDD2' }}>
              {CATEGORY_LABEL.property_professional}
            </button>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {CHIPS.map(chip => (
            <button key={chip.id} onClick={() => toggleChip(chip.id)}
              className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={activeChips.includes(chip.id)
                ? { backgroundColor: '#C45C26', color: '#FFF' }
                : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #E8DDD2' }}>
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* No lat/lng on profiles today (only city/state text) -- see the
          follow-up note in PRODUCTION_HANDOFF.md. Showing an honest
          "spatial proof isn't wired up yet" placeholder instead of faking
          pins from city centroids, which would misrepresent real distance. */}
      {!loading && filtered.length > 0 && (
        <div className="mx-4 mt-4 rounded-2xl flex items-center justify-center gap-2 text-xs" style={{ height: 64, backgroundColor: '#F0E5D8', color: '#8A7E78' }}>
          <MapIcon size={14} /> Map view coming soon - showing {filtered.length} verified provider{filtered.length === 1 ? '' : 's'} by city
        </div>
      )}

      <div className="px-4 mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 rounded-3xl animate-pulse" style={{ backgroundColor: '#F0E5D8' }} />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <ShieldCheck size={36} className="mx-auto mb-3" style={{ color: '#D8C9B8' }} />
            <p className="text-sm font-semibold" style={{ color: '#1A1210' }}>No verified providers match yet</p>
            <p className="text-xs mt-1" style={{ color: '#8A7E78' }}>Try clearing filters, or post a job and let providers come to you.</p>
            <button onClick={() => navigate('/request?mode=bid')} className="btn-primary mt-4 px-6 py-2.5 text-sm">Post a request instead</button>
          </div>
        ) : filtered.map(p => (
          <motion.div key={p.id}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
            whileHover={{ y: -4 }} transition={{ duration: 0.35 }}
            className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#FFF', border: '1px solid #E4D5C4', boxShadow: '0 4px 24px rgba(26,18,16,0.06)' }}>
            {/* Identity -> Badge -> Distance/Rating -> Price -> dual CTA, per spec card order */}
            <div className="h-40 relative" style={{ backgroundColor: '#F0D4BE' }}>
              {p.avatar
                ? <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(196,92,38,0.15), rgba(122,158,126,0.15))' }}>
                    <span className="font-display text-3xl font-black" style={{ color: '#C45C26' }}>{p.name?.[0] || '?'}</span>
                  </div>}
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: '#3D7A45', color: '#FFFFFF' }}>
                {p.level >= 3 ? 'Trusted' : 'Verified'}
              </div>
              {p.recentlyActive && (
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1"
                  style={{ backgroundColor: 'rgba(26,20,16,0.55)', color: '#FFFFFF', backdropFilter: 'blur(4px)' }}>
                  <Zap size={9} /> Active
                </div>
              )}
            </div>

            <div className="p-5">
              <p className="font-display font-black text-base mb-1" style={{ color: '#1A1A1A' }}>{p.name}</p>
              {/* Card fields per spec: name -> skill -> area -> badge/rating -> price -> dual CTA */}
              {p.category && (
                <p className="text-xs font-semibold mb-1" style={{ color: '#C45C26' }}>{p.category}</p>
              )}
              <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color: '#8A7E78' }}>
                {(p.area || p.city || p.state) && <span className="flex items-center gap-1"><MapPin size={11} style={{ color: '#C45C26' }} /> {p.area || p.city || p.state}</span>}
                {p.rating != null && <span className="flex items-center gap-1 ml-1"><Star size={11} className="fill-current" style={{ color: '#D4A853' }} /> {p.rating} ({p.reviewCount})</span>}
              </div>
              <p className="text-xs font-bold mb-3" style={{ color: '#1A1A1A' }}>
                {p.openPrice || !p.priceCents ? 'Open price' : `From ₦${(p.priceCents / 100).toLocaleString()}`}
              </p>

              <div className="flex gap-2">
                <button onClick={() => navigate(`/request?mode=bid&provider=${p.id}`)}
                  className="flex-1 py-2.5 rounded-full text-xs font-bold" style={{ backgroundColor: 'rgba(196,92,38,0.1)', color: '#C45C26' }}>
                  Request Bid
                </button>
                <button onClick={() => navigate(`/provider/${p.id}`)}
                  className="flex-1 py-2.5 rounded-full text-xs font-bold text-white flex items-center justify-center gap-1" style={{ backgroundColor: '#C45C26' }}>
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
