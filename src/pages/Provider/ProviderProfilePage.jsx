import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BadgeCheck, Camera, Clock, Frown, ShieldCheck, Star, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import ReportModal from '@/components/ui/ReportModal'

const ago = (ts) => {
  if (!ts) return null
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ProviderProfilePage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [profile,  setProfile]  = useState(null)
  const [level,    setLevel]    = useState(0)         // ADR-008: 0 none, 1 Identity, 2 Skill, 3 Trusted
  const [levelData, setLevelData] = useState({})
  const [stats,    setStats]    = useState(null)       // provider_stats view: avg_rating, review_count, completion_rate
  const [reviews,  setReviews]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const load = async () => {
      const [{ data: profileData }, { data: vp }, { data: statsData }, { data: reviewRows }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('verified_providers').select('level, level_data').eq('user_id', id).single(),
        supabase.from('provider_stats').select('*').eq('provider_id', id).single(),
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer_id')
          .eq('provider_id', id)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      // Fetched separately rather than via a `profiles:reviewer_id(...)`
      // embed -- that syntax needs a direct FK between reviews and
      // profiles specifically, which the reviews migration doesn't
      // create (reviewer_id references auth.users, not profiles).
      let reviewsWithNames = reviewRows || []
      const reviewerIds = [...new Set(reviewsWithNames.map(r => r.reviewer_id))]
      if (reviewerIds.length) {
        const { data: reviewerProfiles } = await supabase
          .from('profiles').select('id, full_name').in('id', reviewerIds)
        const byId = Object.fromEntries((reviewerProfiles || []).map(p => [p.id, p]))
        reviewsWithNames = reviewsWithNames.map(r => ({ ...r, reviewerName: byId[r.reviewer_id]?.full_name }))
      }

      if (cancelled) return
      setProfile(profileData || null)
      setLevel(vp?.level || 0)
      setLevelData(vp?.level_data || {})
      setStats(statsData || null)
      setReviews(reviewsWithNames)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [id])

  const startBooking = (mode) => {
    // Deep-link into JobPostingPage with the toggle pre-set and this
    // provider pre-selected -- "Book Now" -> nearest-available (instant),
    // "Request Bid" -> multi-attribute reverse (needs a quote first).
    navigate(`/post-job?mode=${mode}&provider=${id}`)
  }

  const portfolioUrls = levelData?.portfolio_urls || []

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <p className="text-sm" style={{ color: '#8A7E78' }}>Loading profile...</p>
    </div>
  )

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="text-center">
        <div className="flex justify-center mb-4"><Frown size={40} style={{ color: '#8A7E78' }} /></div>
        <h2 className="font-display font-black text-xl mb-2" style={{ color: '#1A1210' }}>Provider not found</h2>
      </div>
    </div>
  )

  const lastActiveLabel = ago(profile.last_active_at)

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="max-w-2xl mx-auto px-4 pt-6">

        {/* Header: avatar, name, category, badges */}
        <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ backgroundColor: 'rgba(201,106,58,0.1)' }}>
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : <User size={26} style={{ color: '#C96A3A' }} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-black text-lg" style={{ color: '#1A1210' }}>{profile.full_name}</h1>
              {profile.category_label && (
                <p className="text-xs" style={{ color: '#8A7E78' }}>{profile.category_label}</p>
              )}
              {lastActiveLabel && (
                <p className="text-[11px] mt-0.5" style={{ color: '#B5A99C' }}>Active {lastActiveLabel}</p>
              )}
            </div>
          </div>

          {/* Two distinct badges -- Identity confirms who they are,
              Skill confirms what they can do. Kept separate deliberately,
              conflating them would weaken both. */}
          <div className="flex gap-2">
            {level >= 1 && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ backgroundColor: 'rgba(122,158,126,0.12)', color: '#5C8060' }}>
                <ShieldCheck size={12} /> Identity
              </span>
            )}
            {level >= 2 && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ backgroundColor: 'rgba(91,141,239,0.12)', color: '#4A6FBD' }}>
                <BadgeCheck size={12} /> Skill
              </span>
            )}
            {level >= 3 && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ backgroundColor: 'rgba(212,168,83,0.15)', color: '#A9822F' }}>
                <Star size={12} /> Trusted
              </span>
            )}
            {level === 0 && (
              <span className="text-[11px]" style={{ color: '#B5A99C' }}>Not yet verified</span>
            )}
          </div>
        </div>

        {/* Stats row: completion rate, avg reply time (given equal
            weight to rating -- getting ghosted after paying is the
            biggest fear on a services marketplace) */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <p className="font-black text-lg" style={{ color: '#1A1210' }}>
              {stats?.completion_rate != null ? `${Math.round(stats.completion_rate * 100)}%` : '—'}
            </p>
            <p className="text-[11px]" style={{ color: '#8A7E78' }}>Completion</p>
          </div>
          <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <Clock size={14} className="mx-auto mb-0.5" style={{ color: '#C96A3A' }} />
            <p className="font-black text-lg" style={{ color: '#1A1210' }}>
              {profile.avg_reply_minutes != null ? `${profile.avg_reply_minutes}m` : '—'}
            </p>
            <p className="text-[11px]" style={{ color: '#8A7E78' }}>Avg reply</p>
          </div>
          <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <Star size={14} className="mx-auto mb-0.5" fill="#D4A853" style={{ color: '#D4A853' }} />
            <p className="font-black text-lg" style={{ color: '#1A1210' }}>
              {stats?.avg_rating ?? '—'}
            </p>
            <p className="text-[11px]" style={{ color: '#8A7E78' }}>{stats?.review_count || 0} reviews</p>
          </div>
        </div>

        {/* Portfolio -- for providers without formal certificates, this
            carries more evidentiary weight than any credential field */}
        {portfolioUrls.length > 0 && (
          <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <h3 className="font-display font-black text-base mb-3" style={{ color: '#1A1210' }}>Portfolio</h3>
            <div className="grid grid-cols-3 gap-2">
              {portfolioUrls.slice(0, 6).map((url, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(26,18,16,0.04)' }}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
        {level === 2 && portfolioUrls.length === 0 && (
          <div className="rounded-2xl p-4 mb-4 border flex items-center gap-2" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <Camera size={14} style={{ color: '#B5A99C' }} />
            <p className="text-xs" style={{ color: '#B5A99C' }}>No portfolio photos added yet</p>
          </div>
        )}

        {/* About */}
        {profile.bio && (
          <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <h3 className="font-display font-black text-base mb-2" style={{ color: '#1A1210' }}>About</h3>
            <p className="text-sm leading-relaxed" style={{ color: '#5C4A3A' }}>{profile.bio}</p>
          </div>
        )}

        {/* Reviews -- every one tagged "Completed on DealMatch"; the
            reviews table itself refuses to exist without a completed
            transaction behind it, this label is just surfacing that. */}
        <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
          <h3 className="font-display font-black text-base mb-3" style={{ color: '#1A1210' }}>
            Reviews {stats?.avg_rating ? `· ${stats.avg_rating} average` : ''}
          </h3>
          {reviews.length === 0 ? (
            <p className="text-xs" style={{ color: '#8A7E78' }}>No reviews yet</p>
          ) : (
            <div className="space-y-3">
              {reviews.map(r => (
                <div key={r.id} className="pb-3 border-b last:border-0" style={{ borderColor: '#F0E8DC' }}>
                  <div className="flex items-center gap-1 mb-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} fill={i < r.rating ? '#D4A853' : 'none'} style={{ color: '#D4A853' }} />
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: '#5C4A3A' }}>"{r.comment}"</p>
                  <p className="text-[10px] mt-1" style={{ color: '#B5A99C' }}>
                    {r.reviewerName || 'DealMatch user'} · Completed on DealMatch
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setShowReport(true)}
          className="w-full py-2.5 rounded-2xl text-xs font-semibold mb-4"
          style={{ backgroundColor: 'rgba(201,74,58,0.05)', color: '#C94A3A', border: '1px solid rgba(201,74,58,0.15)' }}>
          Report this provider
        </button>
      </div>

      {/* Sticky dual CTA -- mirrors the two job types: Book Now for a
          simple priced job (nearest-available), Request Bid for
          something bigger that needs a quote first (multi-attribute
          reverse). */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 flex gap-3"
        style={{ backgroundColor: 'rgba(255,250,245,0.97)', backdropFilter: 'blur(10px)', borderTop: '1px solid #E8DDD2' }}>
        <button onClick={() => startBooking('bid')}
          className="flex-1 py-3.5 rounded-2xl text-sm font-bold border-2"
          style={{ borderColor: '#C96A3A', color: '#C96A3A', backgroundColor: '#FFFFFF' }}>
          Request Bid
        </button>
        <button onClick={() => startBooking('book')}
          className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white"
          style={{ backgroundColor: '#C96A3A' }}>
          Book Now
        </button>
      </div>

      {showReport && (
        <ReportModal
          entityType="professional"
          entityId={id}
          listingSource="professionals"
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
