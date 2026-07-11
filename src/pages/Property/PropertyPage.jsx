import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bath, Bed, Flag, Frown, Heart, Home, Key, Map, MapPin, Maximize, MessageCircle, Share2, Shield, User } from 'lucide-react'
import { getProperty, recordSwipe } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { PropertyMap } from '@/components/ui/PropertyMap'
import ImageGallery from '@/components/ui/ImageGallery'
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
  const [showComplaint,   setShowComplaint]   = useState(false)
  const [filingComplaint, setFilingComplaint] = useState(false)
  const [complaintForm,   setComplaintForm]   = useState({ category:'', description:'' })

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

  const submitComplaint = async () => {
    if (!user) { toast.error('Sign in to report a listing'); return }
    if (!complaintForm.category) { toast.error('Select an issue category'); return }
    if (!complaintForm.description.trim()) { toast.error('Describe the problem'); return }
    setFilingComplaint(true)
    const { error } = await supabase.from('complaints').insert({
      property_id:    property.id,
      complainant_id: user.id,
      category:       complaintForm.category,
      description:    complaintForm.description.trim(),
    })
    if (error) toast.error('Could not submit report. Try again.')
    else {
      toast.success('Report submitted. Our team will investigate within 24 hours.')
      setShowComplaint(false)
      setComplaintForm({ category:'', description:'' })
    }
    setFilingComplaint(false)
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

        {/* Report / Complaint button */}
        <button onClick={() => setShowComplaint(true)}
          className="w-full mt-2 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
          style={{ backgroundColor:'rgba(201,74,58,0.05)', color:'#C94A3A', border:'1px solid rgba(201,74,58,0.15)' }}>
          <Flag size={13} /> Report this listing
        </button>
      </div>

      {/* ── Complaint Modal ─────────────────────────────────── */}
      {showComplaint && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor:'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowComplaint(false) }}>
          <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10" style={{ backgroundColor:'#FFFAF5', maxHeight:'85vh', overflowY:'auto' }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor:'#E8DDD2' }} />
            <h3 className="font-display text-lg font-black mb-1" style={{ color:'#1A1210' }}>Report a Problem</h3>
            <p className="text-xs mb-4" style={{ color:'#8A7E78' }}>
              Your report goes directly to our team. The agent who verified this listing will be held accountable.
            </p>

            {/* Category */}
            <p className="text-xs font-bold mb-2" style={{ color:'#1A1210' }}>What's the issue? *</p>
            <div className="space-y-2 mb-4">
              {[
                { id:'fake_listing',      label:'Fake listing — property does not exist' },
                { id:'misrepresentation', label:'Property looks different from photos/description' },
                { id:'wrong_address',     label:'Wrong or misleading address given' },
                { id:'structural_damage', label:'Serious structural damage not disclosed' },
                { id:'fraud',             label:'Fraud or scam attempt' },
                { id:'agent_misconduct',  label:'Agent behaved unprofessionally or dishonestly' },
                { id:'other',             label:'Other issue' },
              ].map(cat => (
                <button key={cat.id}
                  onClick={() => setComplaintForm(f => ({ ...f, category: cat.id }))}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all"
                  style={{
                    backgroundColor: complaintForm.category === cat.id ? 'rgba(201,74,58,0.06)' : 'rgba(26,18,16,0.03)',
                    border: `1.5px solid ${complaintForm.category === cat.id ? '#C94A3A' : '#E8DDD2'}`,
                  }}>
                  <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ border: `2px solid ${complaintForm.category === cat.id ? '#C94A3A' : '#E8DDD2'}`, backgroundColor: complaintForm.category === cat.id ? '#C94A3A' : 'transparent' }}>
                    {complaintForm.category === cat.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs" style={{ color:'#1A1210' }}>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Description */}
            <p className="text-xs font-bold mb-1" style={{ color:'#1A1210' }}>Describe what happened *</p>
            <textarea
              value={complaintForm.description}
              onChange={e => setComplaintForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Provide as much detail as possible — dates, what you were told vs reality, any money lost..."
              rows={4}
              className="w-full rounded-2xl px-4 py-3 text-xs resize-none outline-none mb-4"
              style={{ backgroundColor:'rgba(26,18,16,0.03)', border:'1.5px solid #E8DDD2', color:'#1A1210' }}
            />

            <button onClick={submitComplaint} disabled={filingComplaint || !complaintForm.category || !complaintForm.description.trim()}
              className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
              style={{ backgroundColor:'#C94A3A', color:'white' }}>
              <Flag size={16} />
              {filingComplaint ? 'Submitting...' : 'Submit Report'}
            </button>
            <button onClick={() => setShowComplaint(false)}
              className="w-full mt-2 py-2.5 text-xs" style={{ color:'#8A7E78' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
