import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BadgeCheck, Camera, CheckCircle2, Clock, Frown, Lock, ShieldCheck, Star, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import ReportModal from '@/components/ui/ReportModal'
import UnlockContactButton from '@/components/ui/UnlockContactButton'

const memberSince = (ts) => {
  if (!ts) return null
  return new Date(ts).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

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
  const [stats,    setStats]    = useState(null)       // provider_stats view: avg_rating, review_count, completion_rate, completed_count, disputed_count
  const [reviews,  setReviews]  = useState([])
  const [businessPage, setBusinessPage] = useState(null) // business_pages row, null if this provider hasn't set one up
  const [pageListings, setPageListings] = useState([])   // this profile's active category_listings, read live, not duplicated onto business_pages
  const [payoutStatus, setPayoutStatus] = useState(null) // only populated when the viewer owns this profile
  const [loading,  setLoading]  = useState(true)
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const load = async () => {
      const [{ data: profileData }, { data: vp }, { data: statsData }, { data: reviewRows }, { data: bp }, { data: listingRows }, { data: payoutAcct }] = await Promise.all([
        supabase.from('public_profiles').select('*').eq('id', id).single(),
        supabase.from('verified_providers').select('level, level_data').eq('user_id', id).single(),
        supabase.from('provider_stats').select('*').eq('provider_id', id).single(),
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer_id')
          .eq('provider_id', id)
          .order('created_at', { ascending: false })
          .limit(10),
        // business_pages is metadata only (banner, bio, categories); the
        // listings it "contains" are queried live below rather than
        // duplicated onto the page row, so a page with zero listings
        // still renders, it just shows an empty state.
        supabase.from('business_pages').select('*').eq('profile_id', id).maybeSingle(),
        supabase
          .from('category_listings')
          .select('id, title, price_cents, type, status, created_at')
          .eq('user_id', id)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false })
          .limit(6),
        // Only meaningful when the viewer owns this profile, harmless
        // no-op read otherwise since RLS restricts it to the owner anyway.
        user?.id === id
          ? supabase.from('payout_accounts').select('status').eq('profile_id', id).eq('gateway', 'paystack').maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      // Fetched separately rather than via a `profiles:reviewer_id(...)`
      // embed -- that syntax needs a direct FK between reviews and
      // profiles specifically, which the reviews migration doesn't
      // create (reviewer_id references auth.users, not profiles).
      let reviewsWithNames = reviewRows || []
      const reviewerIds = [...new Set(reviewsWithNames.map(r => r.reviewer_id))]
      if (reviewerIds.length) {
        const { data: reviewerProfiles } = await supabase
          .from('public_profiles').select('id, full_name').in('id', reviewerIds)
        const byId = Object.fromEntries((reviewerProfiles || []).map(p => [p.id, p]))
        reviewsWithNames = reviewsWithNames.map(r => ({ ...r, reviewerName: byId[r.reviewer_id]?.full_name }))
      }

      if (cancelled) return
      setProfile(profileData || null)
      setLevel(vp?.level || 0)
      setLevelData(vp?.level_data || {})
      setStats(statsData || null)
      setReviews(reviewsWithNames)
      setBusinessPage(bp || null)
      setPageListings(listingRows || [])
      setPayoutStatus(payoutAcct?.status || null)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [id])

  const startBooking = (mode) => {
    // Deep-link into JobPostingPage with the toggle pre-set and this
    // provider pre-selected -- "Book Now" -> nearest-available (instant),
    // "Request Bid" -> multi-attribute reverse (needs a quote first).
    navigate(`/request?mode=${mode}&provider=${id}`)
  }

  const portfolioUrls = levelData?.portfolio_urls || []

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <p className="text-sm" style={{ color: '#647068' }}>Loading profile...</p>
    </div>
  )

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="text-center">
        <div className="flex justify-center mb-4"><Frown size={40} style={{ color: '#647068' }} /></div>
        <h2 className="font-display font-black text-xl mb-2" style={{ color: '#17211B' }}>Provider not found</h2>
      </div>
    </div>
  )

  const lastActiveLabel = ago(profile.last_active_at)

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="max-w-2xl mx-auto px-4 pt-6">

        {/* Header: avatar, name, category, badges */}
        <div className="rounded-2xl mb-4 border overflow-hidden" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
          {businessPage?.banner_url && (
            <div className="w-full h-24" style={{ backgroundColor: 'rgba(200,95,45,0.08)' }}>
              <img src={businessPage.banner_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : <User size={26} style={{ color: '#C85F2D' }} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-black text-lg" style={{ color: '#17211B' }}>{profile.full_name}</h1>
              {/* levelData.category is the real, populated field (set by
                  SkillVerificationPage's onboarding submission) - profile's
                  own category_label column exists but nothing writes to it
                  yet, so read from level_data to actually show the skill. */}
              {levelData?.category && (
                <p className="text-xs font-semibold" style={{ color: '#C85F2D' }}>{levelData.category}</p>
              )}
              {levelData?.area && (
                <p className="text-xs" style={{ color: '#647068' }}>{levelData.area}</p>
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

          {/* Business page extras -- categories and member-since only
              render once a business_pages row exists, this is an opt-in
              product on top of the base profile, not automatic. */}
          {businessPage && (
            <div className="flex items-center flex-wrap gap-1.5 mt-3 pt-3 border-t" style={{ borderColor: '#F0E8DC' }}>
              {(businessPage.categories || []).map((c) => (
                <span key={c} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ backgroundColor: 'rgba(23,33,27,0.04)', color: '#5C4A3A' }}>{c}</span>
              ))}
              {memberSince(businessPage.created_at) && (
                <span className="text-[10px] ml-auto" style={{ color: '#B5A99C' }}>
                  On DealMatch since {memberSince(businessPage.created_at)}
                </span>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Payout setup nudge -- only the profile owner sees this, and only
            until payout_accounts has a verified row. This is the gate
            acceptBid() in JobPostingPage also checks server-side. */}
        {user?.id === id && payoutStatus !== 'verified' && (
          <div className="rounded-2xl p-4 mb-4 border flex items-center gap-3" style={{ backgroundColor: 'rgba(200,95,45,0.06)', borderColor: '#E8C4A8' }}>
            <ShieldCheck size={20} style={{ color: '#C85F2D' }} className="flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#17211B' }}>
                {payoutStatus === 'failed' ? 'Payout setup needs another try' : 'Set up payouts to get booked'}
              </p>
              <p className="text-xs" style={{ color: '#647068' }}>Add your bank account so clients can pay you.</p>
            </div>
            <button onClick={() => navigate('/payout-setup')} className="text-xs font-semibold px-3 py-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#C85F2D', color: '#FFF' }}>
              Set up
            </button>
          </div>
        )}

        {/* Stats row: completion rate, avg reply time (given equal
            weight to rating -- getting ghosted after paying is the
            biggest fear on a services marketplace) */}
        <div className={`grid gap-3 mb-4 ${businessPage ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {businessPage && (
            <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
              <CheckCircle2 size={14} className="mx-auto mb-0.5" style={{ color: '#5C8060' }} />
              <p className="font-black text-lg" style={{ color: '#17211B' }}>{stats?.completed_count ?? 0}</p>
              <p className="text-[11px]" style={{ color: '#647068' }}>Deals done</p>
            </div>
          )}
          <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <p className="font-black text-lg" style={{ color: '#17211B' }}>
              {stats?.completion_rate != null ? `${Math.round(stats.completion_rate * 100)}%` : ' - '}
            </p>
            <p className="text-[11px]" style={{ color: '#647068' }}>Completion</p>
          </div>
          <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <Clock size={14} className="mx-auto mb-0.5" style={{ color: '#C85F2D' }} />
            <p className="font-black text-lg" style={{ color: '#17211B' }}>
              {profile.avg_reply_minutes != null ? `${profile.avg_reply_minutes}m` : ' - '}
            </p>
            <p className="text-[11px]" style={{ color: '#647068' }}>Avg reply</p>
          </div>
          <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <Star size={14} className="mx-auto mb-0.5" fill="#D4A853" style={{ color: '#D4A853' }} />
            <p className="font-black text-lg" style={{ color: '#17211B' }}>
              {stats?.avg_rating ?? ' - '}
            </p>
            <p className="text-[11px]" style={{ color: '#647068' }}>{stats?.review_count || 0} reviews</p>
          </div>
        </div>

        {/* Price + contact unlock. Full escrow (funding an actual job
            request) has always unlocked contact for free once funded -
            this adds a second, optional path (item 2 of the fix request):
            spend a small prepaid credit to get the number without
            committing to a job yet. Both paths converge on the same
            get_provider_contact() check, so whichever happens first wins. */}
        <div className="flex items-center justify-between p-3 rounded-2xl mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
          <div>
            <p className="text-[11px] mb-0.5" style={{ color: '#647068' }}>Price</p>
            <p className="font-black text-base" style={{ color: '#C85F2D' }}>
              {levelData?.open_price === false && levelData?.price_cents ? `From ₦${(levelData.price_cents / 100).toLocaleString()}` : 'Open price'}
            </p>
          </div>
          {user?.id === id ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#647068' }}>
              <Lock size={11} /> This is your profile
            </span>
          ) : (
            <UnlockContactButton targetType="provider" targetId={id} />
          )}
        </div>

        {/* Portfolio -- for providers without formal certificates, this
            carries more evidentiary weight than any credential field */}
        {portfolioUrls.length > 0 && (
          <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <h3 className="font-display font-black text-base mb-3" style={{ color: '#17211B' }}>Portfolio</h3>
            <div className="grid grid-cols-3 gap-2">
              {portfolioUrls.slice(0, 6).map((url, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(23,33,27,0.04)' }}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
        {level === 2 && portfolioUrls.length === 0 && (
          <div className="rounded-2xl p-4 mb-4 border flex items-center gap-2" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <Camera size={14} style={{ color: '#B5A99C' }} />
            <p className="text-xs" style={{ color: '#B5A99C' }}>No portfolio photos added yet</p>
          </div>
        )}

        {/* About -- business_pages.bio takes priority once a page exists,
            it's the description the owner is actively curating for the
            page, profile.bio is the fallback for everyone else. */}
        {(businessPage?.bio || profile.bio) && (
          <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <h3 className="font-display font-black text-base mb-2" style={{ color: '#17211B' }}>About</h3>
            <p className="text-sm leading-relaxed" style={{ color: '#5C4A3A' }}>{businessPage?.bio || profile.bio}</p>
          </div>
        )}

        {/* Active listings -- read live from category_listings.user_id,
            not stored on business_pages, so this always reflects what's
            actually postable/bookable right now. */}
        {businessPage && pageListings.length > 0 && (
          <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <h3 className="font-display font-black text-base mb-3" style={{ color: '#17211B' }}>
              Active listings ({pageListings.length})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {pageListings.map((l) => (
                <div key={l.id} className="rounded-xl p-2.5 border" style={{ borderColor: '#F0E8DC' }}>
                  <p className="text-xs font-semibold truncate" style={{ color: '#17211B' }}>{l.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#C85F2D' }}>
                    {l.price_cents ? `₦${(l.price_cents / 100).toLocaleString()}` : 'Open price'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviews -- every one tagged "Completed on DealMatch"; the
            reviews table itself refuses to exist without a completed
            transaction behind it, this label is just surfacing that. */}
        <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
          <h3 className="font-display font-black text-base mb-3" style={{ color: '#17211B' }}>
            Reviews {stats?.avg_rating ? `· ${stats.avg_rating} average` : ''}
          </h3>
          {reviews.length === 0 ? (
            <p className="text-xs" style={{ color: '#647068' }}>No reviews yet</p>
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
        style={{ backgroundColor: 'rgba(255,250,245,0.97)', backdropFilter: 'blur(10px)', borderTop: '1px solid #DEDDD6' }}>
        <button onClick={() => startBooking('bid')}
          className="flex-1 py-3.5 rounded-2xl text-sm font-bold border-2"
          style={{ borderColor: '#C85F2D', color: '#C85F2D', backgroundColor: '#FFFFFF' }}>
          Request Bid
        </button>
        <button onClick={() => startBooking('book')}
          className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white"
          style={{ backgroundColor: '#C85F2D' }}>
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
