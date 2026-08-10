import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bath, Bed, Flag, Frown, Heart, Home, Key, Map, MapPin, Maximize, MessageCircle, Share2, Shield, User } from 'lucide-react'
import { getProperty, recordSwipe } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { PropertyMap } from '@/components/ui/PropertyMap'
import ImageGallery from '@/components/ui/ImageGallery'
import ReportModal from '@/components/ui/ReportModal'
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

  useEffect(() => {
    if (!id) return
    getProperty(id).then(({ data }) => {
      setProperty(data)
      setLoading(false)
    })
  }, [id])

  const handleLike = async () => {
    if (!user) { navigate('/auth'); return }
    await recordSwipe({ userId: user.id, propertyId: id, action: 'like' })
    setLiked(true)
    toast.success('Added to matches!')
  }

  const handleContact = () => {
    if (!property) return
    const msg = encodeURIComponent(
      `Hi, I found your property *"${property.title}"* on DealMatch and I'm interested.\n\n` +
      `Price: ₦${Number(property.price).toLocaleString()}\nLocation: ${property.city}, ${property.state}\n\nCould we discuss further?`
    )
    const phone = property.profiles?.phone?.replace(/\D/g, '') || '2347057392060'
    window.open('https://wa.me/' + phone + '?text=' + msg, '_blank')
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
        <p className="text-sm" style={{ color: '#8A7E78' }}>Loading property...</p>
      </div>
    </div>
  )

  if (!property) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="text-center">
        <div className="flex justify-center mb-4"><Frown size={40} className="text-muted" /></div>
        <h2 className="font-display font-black text-xl mb-2" style={{ color: '#1A1210' }}>Property not found</h2>
        <button onClick={() => navigate('/browse')} className="btn-primary px-6 py-3 text-sm">Browse Properties</button>
      </div>
    </div>
  )

  const PROP_EMOJI = { land: 'land', apartment: 'apartment', duplex: 'duplex', detached: 'detached', terrace: 'terrace', commercial: 'commercial' }

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#FFFAF5' }}>

      {/* Back & share bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: 'rgba(255,250,245,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E8DDD2' }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center border"
          style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFFFF' }}>
          <ArrowLeft size={16} style={{ color: '#1A1210' }} />
        </button>
        <span className="font-display font-black text-base" style={{ color: '#1A1210' }}>
          {PROP_EMOJI[property.property_type] || 'home'} {property.property_type}
        </span>
        <button onClick={handleShare}
          className="w-9 h-9 rounded-full flex items-center justify-center border"
          style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFFFF' }}>
          <Share2 size={16} style={{ color: '#1A1210' }} />
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
            <h1 className="font-display font-black text-3xl" style={{ color: '#C96A3A' }}>
              {formatPrice(property.price)}
            </h1>
            <span className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: 'rgba(201,106,58,0.1)', color: '#C96A3A' }}>
              {property.listing_type}
            </span>
          </div>
          <h2 className="font-display font-black text-xl mb-2" style={{ color: '#1A1210' }}>
            {property.title}
          </h2>
          <div className="flex items-center gap-1.5 text-sm" style={{ color: '#8A7E78' }}>
            <MapPin size={14} style={{ color: '#C96A3A' }} />
            <span>{property.city}, {property.state}</span>
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {property.bedrooms  && (
            <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
              <Bed size={18} className="mx-auto mb-1" style={{ color: '#C96A3A' }} />
              <p className="font-black text-lg" style={{ color: '#1A1210' }}>{property.bedrooms}</p>
              <p className="text-xs" style={{ color: '#8A7E78' }}>Bedrooms</p>
            </div>
          )}
          {property.bathrooms && (
            <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
              <Bath size={18} className="mx-auto mb-1" style={{ color: '#C96A3A' }} />
              <p className="font-black text-lg" style={{ color: '#1A1210' }}>{property.bathrooms}</p>
              <p className="text-xs" style={{ color: '#8A7E78' }}>Bathrooms</p>
            </div>
          )}
          {property.size_sqm  && (
            <div className="rounded-2xl p-3 text-center border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
              <Maximize size={18} className="mx-auto mb-1" style={{ color: '#C96A3A' }} />
              <p className="font-black text-lg" style={{ color: '#1A1210' }}>{property.size_sqm}</p>
              <p className="text-xs" style={{ color: '#8A7E78' }}>sqm</p>
            </div>
          )}
        </div>

        {/* Description */}
        {property.description && (
          <div className="rounded-2xl p-4 mb-5 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <h3 className="font-display font-black text-base mb-2" style={{ color: '#1A1210' }}>About</h3>
            <p className="text-sm leading-relaxed" style={{ color: '#5C4A3A' }}>{property.description}</p>
          </div>
        )}

        {/* Features */}
        {property.features?.length > 0 && (
          <div className="rounded-2xl p-4 mb-5 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <h3 className="font-display font-black text-base mb-3" style={{ color: '#1A1210' }}>Features</h3>
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
          <div className="rounded-2xl p-4 mb-5 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <h3 className="font-display font-black text-base mb-3" style={{ color: '#1A1210' }}>Documents Available</h3>
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
            style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ backgroundColor: 'rgba(201,106,58,0.1)' }}>
              {property.profiles.avatar_url
                ? <img src={property.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                : <User size={20} className="text-muted" />
              }
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: '#1A1210' }}>{property.profiles.full_name}</p>
              <p className="text-xs" style={{ color: '#8A7E78' }}>Property Owner</p>
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4"
        style={{ backgroundColor: 'rgba(255,250,245,0.97)', backdropFilter: 'blur(10px)', borderTop: '1px solid #E8DDD2' }}>
        <div className="max-w-2xl mx-auto flex gap-3">
          <button onClick={handleLike} disabled={liked}
            className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all flex-shrink-0"
            style={{
              borderColor:     liked ? '#7A9E7E' : '#E8DDD2',
              backgroundColor: liked ? 'rgba(122,158,126,0.1)' : '#FFFFFF',
              color:           liked ? '#7A9E7E' : '#C96A3A',
            }}>
            <Heart size={18} fill={liked ? '#7A9E7E' : 'none'} />
          </button>
          <button onClick={handleContact} className="btn-primary flex-1 py-3.5 flex items-center justify-center gap-2">
            <MessageCircle size={16} /> Contact Owner
          </button>
        </div>

        {/* Report button — now opens the generalized ReportModal (writes to
            `reports`, not the old property-only `complaints` table) */}
        <button onClick={() => setShowComplaint(true)}
          className="w-full mt-2 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
          style={{ backgroundColor:'rgba(201,74,58,0.05)', color:'#C94A3A', border:'1px solid rgba(201,74,58,0.15)' }}>
          <Flag size={13} /> Report this listing
        </button>
      </div>

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
