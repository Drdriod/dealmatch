import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bath, Bed, Flag, Frown, Heart, Home, Key, Lock, Map, MapPin, Maximize, MessageCircle, Share2, Shield, User } from 'lucide-react'
import { getProperty, recordSwipe, supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { PropertyMap } from '@/components/ui/PropertyMap'
import ImageGallery from '@/components/ui/ImageGallery'
import ReportModal from '@/components/ui/ReportModal'
import GuestAuthModal from '@/components/ui/GuestAuthModal'
import PropertyReserveModal from '@/components/ui/PropertyReserveModal'
import toast from 'react-hot-toast'

const formatPrice = (n) => {
  if (!n) return '₦0'
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  return `₦${(n / 1_000).toFixed(0)}K`
}

export default function PropertyPage() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const [property, setProperty] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [liked,    setLiked]    = useState(false)
  const [showComplaint, setShowComplaint] = useState(false)
  const [showGuestAuth, setShowGuestAuth] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'like' | 'reserve' -- resumed after guest auth succeeds
  const [showReserve, setShowReserve] = useState(false)
  const [contact, setContact] = useState(null)       // { full_name, phone, avatar_url, unlocked_reason } once entitled
  const [contactChecked, setContactChecked] = useState(false)

  useEffect(() => {
    if (!id) return
    getProperty(id).then(({ data }) => {
      setProperty(data)
      setLoading(false)
    })
  }, [id])

  // Escrow-gated contact check: never trust a client-side join for this  - 
  // ask the database, which only answers for the owner, staff, or a party
  // to a FUNDED escrow deal on this exact property (see
  // get_property_contact() in supabase/migrations/20260812000000_production_hardening.sql).
  const checkContact = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.rpc('get_property_contact', { p_property_id: id })
    setContact(Array.isArray(data) ? data[0] || null : data || null)
    setContactChecked(true)
  }, [id])

  useEffect(() => { checkContact() }, [checkContact])

  const handleLike = async () => {
    if (!user) { setPendingAction('like'); setShowGuestAuth(true); return }
    await recordSwipe({ userId: user.id, propertyId: id, action: 'like' })
    setLiked(true)
    toast.success('Added to matches!')
  }

  const handleReserve = () => {
    if (!user) { setPendingAction('reserve'); setShowGuestAuth(true); return }
    setShowReserve(true)
  }

  const handleGuestAuthSuccess = async (guestUser) => {
    setShowGuestAuth(false)
    const action = pendingAction
    setPendingAction(null)
    const uid = guestUser?.id || user?.id
    if (action === 'like' && uid) {
      await recordSwipe({ userId: uid, propertyId: id, action: 'like' })
      setLiked(true)
      toast.success('Added to matches!')
    } else if (action === 'reserve') {
      setShowReserve(true)
    }
  }

  // Contact button: opens WhatsApp with the REAL owner number only once
  // get_property_contact() has actually returned it (owner viewing their
  // own listing, staff, or a funded-escrow counterparty). Everyone else
  // sees "Reserve to unlock contact" instead - no number is ever fetched
  // or exposed client-side until entitlement is confirmed server-side.
  const handleContact = () => {
    if (!property) return
    if (!contact?.phone) { handleReserve(); return }
    const msg = encodeURIComponent(
      `Hi, I found your property *"${property.title}"* on DealMatch and I'm interested.\n\n` +
      `Price: ₦${Number(property.price).toLocaleString()}\nLocation: ${property.city}, ${property.state}\n\nCould we discuss further?`
    )
    window.open('https://wa.me/' + contact.phone.replace(/\D/g, '') + '?text=' + msg, '_blank')
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: property?.title, url })
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied!')
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="text-center">
        <div className="flex justify-center mb-3"><Home size={40} className="text-terracotta animate-bounce" /></div>
        <p className="text-sm" style={{ color: '#647068' }}>Loading property...</p>
      </div>
    </div>
  )

  if (!property) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="text-center">
        <div className="flex justify-center mb-4"><Frown size={40} className="text-muted" /></div>
        <h2 className="font-display font-black text-xl mb-2" style={{ color: '#17211B' }}>Property not found</h2>
        <button onClick={() => navigate('/browse')} className="btn-primary px-6 py-3 text-sm">Browse Properties</button>
      </div>
    </div>
  )

  const PROP_EMOJI = { land: 'land', apartment: 'apartment', duplex: 'duplex', detached: 'detached', terrace: 'terrace', commercial: 'commercial' }

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#FFFAF5' }}>

      {/* Back & share bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: 'rgba(255,250,245,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #DEDDD6' }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center border"
          style={{ borderColor: '#DEDDD6', backgroundColor: '#FFFFFF' }}>
          <ArrowLeft size={16} style={{ color: '#17211B' }} />
        </button>
        <span className="font-display font-black text-base" style={{ color: '#17211B' }}>
          {PROP_EMOJI[property.property_type] || 'home'} {property.property_type}
        </span>
        <button onClick={handleShare}
          className="w-9 h-9 rounded-full flex items-center justify-center border"
          style={{ borderColor: '#DEDDD6', backgroundColor: '#FFFFFF' }}>
          <Share2 size={16} style={{ color: '#17211B' }} />
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">

        {/* Gallery */}
        <div className="mb-5">
          <ImageGallery images={property.images || []} title={property.title} />
        </div>

        {/* Price & title */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h1 className="font-display font-black text-3xl" style={{ color: '#C85F2D' }}>
              {formatPrice(property.price)}
            </h1>
            <span className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: 'rgba(200,95,45,0.1)', color: '#C85F2D' }}>
              {property.listing_type}
            </span>
          </div>
          <h2 className="font-display font-black text-xl mb-2" style={{ color: '#17211B' }}>
            {property.title}
          </h2>
          <div className="flex items-center gap-1.5 text-sm" style={{ color: '#647068' }}>
            <MapPin size={14} style={{ color: '#C85F2D' }} />
            <span>{property.city}, {property.state}</span>
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {property.bedrooms  && (
            <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
              <Bed size={18} className="mx-auto mb-1" style={{ color: '#C85F2D' }} />
              <p className="font-black text-lg" style={{ color: '#17211B' }}>{property.bedrooms}</p>
              <p className="text-xs" style={{ color: '#647068' }}>Bedrooms</p>
            </div>
          )}
          {property.bathrooms && (
            <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
              <Bath size={18} className="mx-auto mb-1" style={{ color: '#C85F2D' }} />
              <p className="font-black text-lg" style={{ color: '#17211B' }}>{property.bathrooms}</p>
              <p className="text-xs" style={{ color: '#647068' }}>Bathrooms</p>
            </div>
          )}
          {property.size_sqm  && (
            <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
              <Maximize size={18} className="mx-auto mb-1" style={{ color: '#C85F2D' }} />
              <p className="font-black text-lg" style={{ color: '#17211B' }}>{property.size_sqm}</p>
              <p className="text-xs" style={{ color: '#647068' }}>sqm</p>
            </div>
          )}
        </div>

        {/* Description */}
        {property.description && (
          <div className="rounded-2xl p-4 mb-5 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <h3 className="font-display font-black text-base mb-2" style={{ color: '#17211B' }}>About</h3>
            <p className="text-sm leading-relaxed" style={{ color: '#5C4A3A' }}>{property.description}</p>
          </div>
        )}

        {/* Features */}
        {property.features?.length > 0 && (
          <div className="rounded-2xl p-4 mb-5 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <h3 className="font-display font-black text-base mb-3" style={{ color: '#17211B' }}>Features</h3>
            <div className="flex flex-wrap gap-2">
              {property.features.map(f => (
                <span key={f} className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: 'rgba(122,158,126,0.1)', color: '#5C8060' }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        {property.documents?.length > 0 && (
          <div className="rounded-2xl p-4 mb-5 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <h3 className="font-display font-black text-base mb-3" style={{ color: '#17211B' }}>Documents Available</h3>
            <div className="space-y-2">
              {property.documents.map(d => (
                <div key={d} className="flex items-center gap-2 text-sm">
                  <Shield size={13} style={{ color: '#7A9E7E' }} />
                  <span style={{ color: '#5C4A3A' }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Map */}
        <div className="mb-5">
          <PropertyMap property={property} />
        </div>

        {/* Seller */}
        {property.profiles && (
          <div className="rounded-2xl p-4 mb-5 border flex items-center gap-3"
            style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
              {property.profiles.avatar_url
                ? <img src={property.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                : <User size={20} className="text-muted" />
              }
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: '#17211B' }}>{property.profiles.full_name}</p>
              <p className="text-xs" style={{ color: '#647068' }}>Property Owner</p>
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4"
        style={{ backgroundColor: 'rgba(255,250,245,0.97)', backdropFilter: 'blur(10px)', borderTop: '1px solid #DEDDD6' }}>
        <div className="max-w-2xl mx-auto flex gap-3">
          <button onClick={handleLike} disabled={liked}
            className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all flex-shrink-0"
            style={{
              borderColor:     liked ? '#7A9E7E' : '#DEDDD6',
              backgroundColor: liked ? 'rgba(122,158,126,0.1)' : '#FFFFFF',
              color:           liked ? '#7A9E7E' : '#C85F2D',
            }}>
            <Heart size={18} fill={liked ? '#7A9E7E' : 'none'} />
          </button>
          <button onClick={handleContact} className="btn-primary flex-1 py-3.5 flex items-center justify-center gap-2">
            {contact?.phone
              ? <><MessageCircle size={16} /> Contact Owner</>
              : <><Lock size={16} /> Reserve to Unlock Contact</>}
          </button>
        </div>
        {!contact?.phone && contactChecked && (
          <p className="text-center text-[11px] mt-2" style={{ color: '#647068' }}>
            Owner contact unlocks after your payment is placed under DealMatch Protection.
          </p>
        )}

        {/* Report button - now opens the generalized ReportModal (writes to
            `reports`, not the old property-only `complaints` table) */}
        <button onClick={() => setShowComplaint(true)}
          className="w-full mt-2 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
          style={{ backgroundColor:'rgba(201,74,58,0.05)', color:'#C94A3A', border:'1px solid rgba(201,74,58,0.15)' }}>
          <Flag size={13} /> Report this listing
        </button>
      </div>

      {showGuestAuth && (
        <GuestAuthModal
          title="Sign in to continue"
          subtitle="Verify your phone number to save or reserve this property - no password needed."
          onClose={() => { setShowGuestAuth(false); setPendingAction(null) }}
          onSuccess={handleGuestAuthSuccess}
        />
      )}

      {showReserve && property && (
        <PropertyReserveModal
          property={property}
          onClose={() => setShowReserve(false)}
          onFunded={() => { setShowReserve(false); checkContact() }}
        />
      )}

      {showComplaint && (
        <ReportModal
          entityType="property"
          entityId={property.id}
          listingSource="properties"
          onClose={() => setShowComplaint(false)}
        />
      )}
    </div>
  )
}
