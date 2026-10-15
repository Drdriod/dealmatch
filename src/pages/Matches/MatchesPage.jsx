import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bath, Bed, Heart, HeartCrack, Home, MapPin, Maximize, MessageCircle, Trash2 } from 'lucide-react'
import { getMatches } from '@/lib/supabase'
import { removeSwipe } from '@/data/matchesRepository'
import { useAuth } from '@/context/AuthContext'
import { motion, AnimatePresence } from 'motion/react'
import toast from 'react-hot-toast'

const formatPrice = (n) => {
  if (!n) return '₦0'
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  return `₦${(n / 1_000).toFixed(0)}K`
}

export default function MatchesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    if (!user) return
    loadMatches()
  }, [user])

  const loadMatches = async () => {
    setLoading(true)
    const { data } = await getMatches(user.id)
    setMatches(data || [])
    setLoading(false)
  }

  const removeMatch = async (swipeId) => {
    const { error } = await removeSwipe(swipeId)
    if (error) { toast.error('Could not remove'); return }
    setMatches(m => m.filter(s => s.id !== swipeId))
    toast.success('Removed from matches')
  }

  const contactSeller = (property) => {
    const msg = encodeURIComponent(
      `Hi, I'm interested in your property *"${property.title}"* listed on DealMatch.\n\n` +
      `Price: ₦${Number(property.price).toLocaleString()}\n` +
      `Location: ${property.city}, ${property.state}\n\nCould we discuss further?`
    )
    const phone = property.profiles?.phone?.replace(/\D/g, '') || '2347057392060'
    window.open('https://wa.me/' + phone + '?text=' + msg, '_blank')
  }

  const filtered = filter === 'super'
    ? matches.filter(m => m.action === 'super')
    : matches

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-black" style={{ color: '#17211B' }}>
            My Matches
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#647068' }}>
            {matches.length} saved propert{matches.length === 1 ? 'y' : 'ies'}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {[['all','All Matches'],['super','⭐ Super Liked']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className="px-4 py-2 rounded-full text-sm font-semibold border transition-all"
              style={{
                backgroundColor: filter === v ? '#17211B' : '#FFFFFF',
                color:           filter === v ? '#FFFFFF'  : '#5C4A3A',
                borderColor:     filter === v ? '#17211B'  : '#DEDDD6',
              }}>
              {l}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-20" style={{ color: '#647068' }}>Loading matches...</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-3xl p-10 text-center" style={{ backgroundColor: '#FFFAF5' }}>
            <div className="flex justify-center mb-4"><HeartCrack size={48} className="text-terracotta" /></div>
            <h3 className="font-display font-black text-xl mb-2" style={{ color: '#17211B' }}>
              No matches yet
            </h3>
            <p className="text-sm mb-6" style={{ color: '#647068' }}>
              Swipe right on properties you like to see them here.
            </p>
            <Link to="/browse" className="btn-primary px-8 py-3 text-sm inline-flex">
              Browse Properties →
            </Link>
          </div>
        )}

        <div className="space-y-4">
          <AnimatePresence>
            {filtered.map(match => {
              const p   = match.properties
              const img = p?.images?.find(i => i?.is_primary)?.url || p?.images?.[0]?.url
              return (
                <motion.div key={match.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className="rounded-2xl overflow-hidden border"
                  style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
                  <div className="flex gap-0">
                    {/* Image */}
                    <div className="w-28 flex-shrink-0 relative" style={{ minHeight: 120 }}>
                      {img ? (
                        <img src={img} alt={p?.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl"
                          style={{ backgroundColor: 'rgba(200,95,45,0.08)' }}>
                          <Home size={40} className="text-terracotta" />
                        </div>
                      )}
                      {match.action === 'super' && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: '#D4A853', color: '#FFFFFF' }}>
                          ⭐ Super
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-3">
                      <p className="font-display font-black text-base leading-tight mb-0.5" style={{ color: '#17211B' }}>
                        {formatPrice(p?.price)}
                      </p>
                      <p className="font-semibold text-sm truncate mb-1" style={{ color: '#5C4A3A' }}>
                        {p?.title}
                      </p>
                      <div className="flex items-center gap-1 text-xs mb-2" style={{ color: '#647068' }}>
                        <MapPin size={11} />
                        <span className="truncate">{p?.city}, {p?.state}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs" style={{ color: '#647068' }}>
                        {p?.bedrooms  && <span className="flex items-center gap-0.5"><Bed size={10} /> {p.bedrooms}bd</span>}
                        {p?.bathrooms && <span className="flex items-center gap-0.5"><Bath size={10} /> {p.bathrooms}ba</span>}
                        {p?.size_sqm  && <span className="flex items-center gap-0.5"><Maximize size={10} /> {p.size_sqm}sqm</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 px-3 pb-3">
                    <button onClick={() => navigate(`/property/${p?.id}`)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
                      style={{ backgroundColor: '#C85F2D', color: '#FFFFFF' }}>
                      View Details
                    </button>
                    <button onClick={() => contactSeller(p)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold border"
                      style={{ borderColor: 'rgba(23,33,27,0.15)', color: '#17211B' }}>
                      <MessageCircle size={12} /> Chat
                    </button>
                    <button onClick={() => removeMatch(match.id)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center border"
                      style={{ borderColor: 'rgba(200,95,45,0.2)', color: '#C85F2D', backgroundColor: 'rgba(200,95,45,0.05)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
