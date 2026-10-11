/**
 * Agent Verification Page: DealMatch internal
 * DealMatch trusted agents visit property locations and verify listings
 * Only accessible to verified agent accounts (checked against profiles table)
 */
import React, { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Camera, Check, CheckCircle, Clock, Home, MapPin, RefreshCw, Shield, Video, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const AGENT_ROLES = ['agent', 'admin']

const STATUS_FLOW = {
  pending_review:      { label:'Awaiting Verification', color:'#D4A853', bg:'rgba(212,168,83,0.12)', next:'under_verification' },
  under_verification:  { label:'Agent Assigned',        color:'#5B8DEF', bg:'rgba(91,141,239,0.12)', next:'active' },
  active:              { label:'Verified & Live',        color:'#5C8060', bg:'rgba(122,158,126,0.12)', next:null },
  rejected:            { label:'Rejected',               color:'#C85F2D', bg:'rgba(200,95,45,0.12)', next:null },
}

export default function VerificationPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [listings, setListings]   = useState([])
  const [loading,  setLoading]    = useState(true)
  const [filter,   setFilter]     = useState('pending_review')
  const [selected, setSelected]   = useState(null)
  const [note,     setNote]       = useState('')
  const [saving,   setSaving]     = useState(false)

  useEffect(() => {
    if (!profile) return
    if (!AGENT_ROLES.includes(profile.role)) { navigate('/'); return }
    loadListings()
  }, [profile, filter])

  const loadListings = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('properties')
      .select('*, profiles(full_name, phone, email, avatar_url)')
      .eq('status', filter)
      .order('created_at', { ascending: true })
      .limit(50)
    setListings(data || [])
    setLoading(false)
  }

  const updateStatus = async (property, newStatus) => {
    setSaving(true)
    const { error } = await supabase
      .from('properties')
      .update({
        status:            newStatus,
        verified_by:       user.id,
        verified_at:       newStatus === 'active' ? new Date().toISOString() : null,
        verification_note: note || null,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', property.id)
    setSaving(false)

    if (error) { toast.error('Update failed: ' + error.message); return }

    const statusLabel = newStatus === 'active' ? 'Verified' : newStatus === 'rejected' ? 'Rejected ' : 'Updated'
    toast.success(`${property.title} : ${statusLabel}`)

    // Notify landlord via WhatsApp
    const phone = property.profiles?.phone?.replace(/\D/g,'')
    if (phone) {
      const msg = newStatus === 'active'
        ? encodeURIComponent(`*DealMatch: Property Verified!*\n\nHi ${property.profiles?.full_name || 'there'},\n\nYour property listing *"${property.title}"* has been verified by our agent and is now LIVE on DealMatch. Buyers can now see and match with your property.\n\n www.dealmatch.com.ng`)
        : encodeURIComponent(`*DealMatch: Property Not Approved*\n\nHi ${property.profiles?.full_name || 'there'},\n\nYour listing *"${property.title}"* could not be verified at this time.\n\nReason: ${note || 'Please contact DealMatch for details.'}\n\nWhatsApp: +234 705 739 2060`)
      window.open('https://wa.me/' + phone + '?text=' + msg, '_blank')
    }

    setSelected(null)
    setNote('')
    loadListings()
  }

  if (!profile || !AGENT_ROLES.includes(profile.role)) return null

  const FILTERS = [
    { key:'pending_review',     label:'Pending',    count: null },
    { key:'under_verification', label:'In Progress', count: null },
    { key:'active',             label:'Verified',    count: null },
    { key:'rejected',           label:'Rejected',    count: null },
  ]

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#F5EDE0' }}>
      <div className="max-w-3xl mx-auto px-4">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color:'#17211B' }}>
              Property Verification
            </h1>
            <p className="text-xs mt-0.5" style={{ color:'#647068' }}>DealMatch Agent Dashboard</p>
          </div>
          <button onClick={loadListings}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor:'rgba(23,33,27,0.08)' }}>
            <RefreshCw size={16} style={{ color:'#5C4A3A' }} />
          </button>
        </div>

        {/* Workflow explainer */}
        <div className="rounded-2xl p-4 mb-6 border" style={{ backgroundColor:'rgba(122,158,126,0.08)', borderColor:'rgba(122,158,126,0.25)' }}>
          <p className="text-xs font-bold mb-2" style={{ color:'#5C8060' }}>Verification Workflow</p>
          <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color:'#647068' }}>
            {['Landlord Submits','→','Agent Visits Location','→','Agent Verifies / Rejects','→','Property Goes Live'].map((s,i) => (
              <span key={i} style={{ color: s === '→' ? '#C85F2D' : undefined }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth:'none' }}>
          {FILTERS.map(f => {
            const s = STATUS_FLOW[f.key]
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-4 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap border flex-shrink-0 transition-all"
                style={{
                  backgroundColor: filter === f.key ? '#17211B' : '#FFFFFF',
                  color:           filter === f.key ? '#FFFFFF'  : '#5C4A3A',
                  borderColor:     filter === f.key ? '#17211B'  : '#DEDDD6',
                }}>
                {f.label}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color:'#647068' }}>Loading listings...</div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor:'#FFFAF5', borderColor:'#DEDDD6' }}>
            <div className="flex justify-center mb-3"><CheckCircle size={40} className="text-green-600" /></div>
            <p className="font-semibold text-sm" style={{ color:'#17211B' }}>No listings in this category</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map(listing => {
              const s    = STATUS_FLOW[listing.status] || STATUS_FLOW.pending_review
              const img  = listing.images?.[0]?.url || null
              const isSelected = selected?.id === listing.id

              return (
                <motion.div key={listing.id} layout
                  className="rounded-2xl border overflow-hidden cursor-pointer transition-all"
                  style={{ backgroundColor:'#FFFAF5', borderColor: isSelected ? '#C85F2D' : '#DEDDD6' }}
                  onClick={() => setSelected(isSelected ? null : listing)}>

                  <div className="flex gap-0">
                    {/* Image */}
                    <div className="w-24 flex-shrink-0" style={{ minHeight:96 }}>
                      {img
                        ? <img src={img} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-3xl" style={{ backgroundColor:'rgba(200,95,45,0.08)' }}><Home size={24} className="text-terracotta" /></div>
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-semibold text-sm truncate" style={{ color:'#17211B' }}>{listing.title}</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                          style={{ backgroundColor:s.bg, color:s.color }}>
                          {s.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs mb-1" style={{ color:'#647068' }}>
                        <MapPin size={10} style={{ color:'#C85F2D' }} />
                        <span className="truncate">{listing.address || listing.city}, {listing.state}</span>
                      </div>
                      <div className="text-xs" style={{ color:'#647068' }}>
                        Owner: <strong style={{ color:'#17211B' }}>{listing.profiles?.full_name || 'Unknown'}</strong>
                        {listing.profiles?.phone && <span> · {listing.profiles.phone}</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs mt-1" style={{ color:'rgba(23,33,27,0.4)' }}>
                        <Clock size={9} />
                        <span>Submitted {new Date(listing.created_at).toLocaleDateString('en-NG')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded actions */}
                  {isSelected && (
                    <div className="p-4 border-t" style={{ borderColor:'#DEDDD6', backgroundColor:'rgba(200,95,45,0.02)' }}>
                      {/* Images */}
                      {listing.images?.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto mb-3 pb-1" style={{ scrollbarWidth:'none' }}>
                          {listing.images.map((img, i) => (
                            <img key={i} src={img.url} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                          ))}
                        </div>
                      )}

                      {/* Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs mb-4" style={{ color:'#5C4A3A' }}>
                        {[
                          ['Type',     listing.property_type],
                          ['Category', listing.category],
                          ['Price',    `₦${Number(listing.price).toLocaleString()}`],
                          ['Size',     listing.size_sqm ? `${listing.size_sqm}sqm` : 'N/A'],
                          ['Documents', listing.documents?.join(', ') || 'None listed'],
                          ['Video',    listing.video_url ? 'Provided' : 'None'],
                        ].map(([k,v]) => (
                          <div key={k} className="rounded-xl p-2" style={{ backgroundColor:'rgba(23,33,27,0.04)' }}>
                            <span style={{ color:'#647068' }}>{k}: </span>
                            <strong>{v}</strong>
                          </div>
                        ))}
                      </div>

                      {listing.description && (
                        <p className="text-xs mb-4 leading-relaxed" style={{ color:'#647068' }}>{listing.description}</p>
                      )}

                      {/* Verification note */}
                      <div className="mb-4">
                        <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color:'rgba(23,33,27,0.5)' }}>
                          Verification Note (optional)
                        </label>
                        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                          placeholder="Add any notes from the site visit..."
                          className="input resize-none text-sm w-full" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-3">
                        {listing.status !== 'active' && (
                          <button onClick={() => updateStatus(listing, 'active')} disabled={saving}
                            className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                            style={{ backgroundColor:'rgba(122,158,126,0.15)', color:'#5C8060', border:'2px solid rgba(122,158,126,0.3)' }}>
                            <Check size={14} /> Verify & Approve
                          </button>
                        )}
                        {listing.status !== 'rejected' && (
                          <button onClick={() => updateStatus(listing, 'rejected')} disabled={saving}
                            className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                            style={{ backgroundColor:'rgba(200,95,45,0.08)', color:'#C85F2D', border:'2px solid rgba(200,95,45,0.2)' }}>
                            <X size={14} /> Reject
                          </button>
                        )}
                        {listing.status === 'pending_review' && (
                          <button onClick={() => updateStatus(listing, 'under_verification')} disabled={saving}
                            className="flex-1 py-3 rounded-xl text-sm font-bold"
                            style={{ backgroundColor:'rgba(91,141,239,0.1)', color:'#5B8DEF', border:'2px solid rgba(91,141,239,0.25)' }}>
                            Assign to Me
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
