/**
 * VerifyIdentityPage - /verify-identity
 * ══════════════════════════════════════
 * Universal identity verification for ALL non-student roles.
 *
 * ROLE SYSTEM:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Role         │ Verification Required For                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ buyer        │ Expressing interest in buying / deal agreements  │
 * │ seller       │ Listing a property for sale                      │
 * │ renter       │ Signing tenancy agreements / escrow payments     │
 * │ landlord     │ Listing properties / receiving escrow payouts    │
 * │ investor     │ Deal agreements / escrow payments                │
 * │ agent        │ All client-facing deal actions                   │
 * │ lender       │ All lending and mortgage actions                 │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * SKIP POLICY:
 * - Users may skip verification to browse, swipe, book hotels/short-lets
 * - Verification wall blocks ONLY: buying interest, listing, tenancy, escrow
 * - Skip preference is stored in profile.verification_skipped = true
 * - On any blocked action, user is redirected back here
 *
 * STUDENT CONFLICT:
 * - Students use /student-verify (separate flow, separate table)
 * - This page is shown only to non-student roles
 * - Students who also want to buy/sell use BOTH flows independently
 */

import React, { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Camera, Car, Check, Clock, CreditCard, Eye, Info, Lock, Shield, SkipForward, Store, Upload, Users, Vote, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'

const ID_TYPES = [
  { id:'nin',      label:'NIN Slip / Card',        icon: <CreditCard size={20} className="text-terracotta" /> },
  { id:'voters',   label:"Voter's Card",            icon: <Vote size={20} className="text-terracotta" /> },
  { id:'passport', label:'International Passport',  icon: <BookOpen size={20} className="text-terracotta" /> },
  { id:'drivers',  label:"Driver's License",        icon: <Car size={20} className="text-terracotta" /> },
]

// What each role needs to verify for
const ROLE_LABELS = {
  buyer:    'express interest in buying a property',
  seller:   'list your property for sale',
  renter:   'sign tenancy agreements and make protection payments',
  landlord: 'list properties and receive protection payouts',
  investor: 'make deal agreements and protection payments',
  agent:    'act on behalf of clients in deals',
  lender:   'approve and manage mortgage applications',
}

export default function VerifyIdentityPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const idFileRef = useRef(null)
  const faceFileRef = useRef(null)

  // Where to redirect after skip or completion
  const returnTo = location.state?.returnTo || null

  const [step,        setStep]        = useState(0) // 0=intro, 1=ID, 2=face, 3=done
  const [idType,      setIdType]      = useState('')
  const [idFile,      setIdFile]      = useState(null)
  const [idPreview,   setIdPreview]   = useState(null)
  const [faceCapture, setFaceCapture] = useState(null) // preview object URL
  const [faceFile,    setFaceFile]    = useState(null) // compressed Blob to upload
  const [saving,      setSaving]      = useState(false)
  const [skipping,    setSkipping]    = useState(false)

  // Post-verification routing: previously branched on profile.role to
  // /landlord or /lender, neither of which are registered routes in
  // App.jsx - dead links. That part of the fix stands regardless of the
  // role/persona hotfix below: everyone lands on /search after
  // verification, which works for every role.
  const role      = profile?.role || 'buyer'
  const roleLabel = ROLE_LABELS[role] || 'complete transactions'
  const alreadySubmitted = profile?.identity_verification_status === 'submitted'
  const alreadyVerified  = profile?.is_photo_verified && profile?.is_live_verified

  // ── Skip verification ────────────────────────────────────────────
  const handleSkip = async () => {
    setSkipping(true)
    try {
      await supabase.from('profiles')
        .update({ verification_skipped: true })
        .eq('id', user.id)
      await refreshProfile()
      toast('Verification skipped. You can verify anytime from your profile.', {
        icon: 'ℹ️', duration: 4000,
      })
      if (returnTo) {
        navigate(returnTo, { replace: true })
      } else {
        navigate('/search', { replace: true })
      }
    } catch {
      toast.error('Could not skip. Please try again.')
    }
    setSkipping(false)
  }

  // ── ID document upload ───────────────────────────────────────────
  const handleIdUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      toast.error('Please upload a JPG, PNG or WEBP image'); return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB'); return
    }
    setIdFile(file)
    setIdPreview(URL.createObjectURL(file))
  }

  // ── Selfie upload (native file input, no camera API / canvas ref) ──
  // Swapped out getUserMedia()+<canvas ref> for a plain <input type="file"
  // capture="user">. On mobile this still opens the front camera directly
  // (same UX as before), but it's a native browser control instead of
  // custom camera plumbing - removes an entire class of bugs (permission
  // states, video element lifecycle, canvas-ref-goes-null-after-capture).
  // Compression still happens client-side, but via a canvas created fresh
  // in this function (never mounted/tied to React's render tree), so
  // there's no ref-unmount timing issue to worry about.
  const handleFaceUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      toast.error('Please upload a JPG, PNG or WEBP image'); return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('File must be under 8MB'); return
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      const MAX_DIMENSION = 1280
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        URL.revokeObjectURL(objectUrl)
        if (!blob) { toast.error('Could not process that image. Please try another photo.'); return }
        setFaceFile(blob)
        setFaceCapture(URL.createObjectURL(blob))
        toast.success('Selfie added!')
      }, 'image/jpeg', 0.85)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      toast.error('Could not read that image. Please try another photo.')
    }
    img.src = objectUrl
  }

  const retakePhoto = () => {
    setFaceCapture(null)
    setFaceFile(null)
    if (faceFileRef.current) faceFileRef.current.value = ''
  }

  // ── Final submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!idFile && !idPreview) { toast.error('Please upload your ID document'); return }
    if (!faceCapture || !faceFile) { toast.error('Please add a selfie'); return }
    if (!idType) { toast.error('Please select your ID type'); return }
    setSaving(true)

    try {
      const { data: freshProfile } = await supabase
        .from('profiles').select('is_live_verified').eq('id', user.id).single()
      if (freshProfile?.is_live_verified) {
        toast.success('You are already verified!')
        navigate(returnTo || '/browse', { replace: true })
        return
      }

      // ✅ FIX: paths must NOT repeat the bucket name - RLS policies check
      // that the FIRST folder segment of the path equals auth.uid(). The
      // old path ("identity-docs/{uid}/...") made "identity-docs" itself
      // the first segment, so the check always failed and every single
      // submission was silently rejected by the database.
      const idPath   = `${user.id}/id_${Date.now()}.jpg`
      const facePath = `${user.id}/face_${Date.now()}.jpg`

      if (idFile) {
        const { error: idErr } = await supabase.storage.from('identity-docs').upload(idPath, idFile, { upsert:true })
        // ✅ SECURITY FIX: no longer falls back to the PUBLIC 'avatars'
        // bucket on failure - identity documents must stay in the private
        // bucket. A real failure here should surface as an error, not
        // silently leak ID photos into a publicly-readable bucket.
        if (idErr) throw new Error(`ID upload failed: ${idErr.message}`)
      }

      // Upload selfie - faceFile is the compressed Blob set by
      // handleFaceUpload when the file was selected/captured.
      if (!faceFile) throw new Error('Selfie image was not captured correctly. Please retake it.')
      const { error: faceErr } = await supabase.storage.from('identity-docs').upload(facePath, faceFile, { upsert:true, contentType:'image/jpeg' })
      if (faceErr) throw new Error(`Selfie upload failed: ${faceErr.message}`)

      // Store the storage paths (not public URLs) - bucket is PRIVATE
      // Admin will generate short-lived signed URLs when viewing submissions

      await supabase.from('profiles').update({
        identity_photo_url:           idPath,   // storage path - private bucket, signed URL generated on read
        identity_selfie_url:          facePath, // storage path - private bucket, signed URL generated on read
        identity_doc_type:            idType,
        identity_verification_status: 'submitted',
        verification_skipped:         false,
        // SECURITY: is_photo_verified / is_live_verified set ONLY by admin
      }).eq('id', user.id).then(({ error, count }) => {
        // This call's result was previously discarded entirely - if the
        // update failed for any reason (an RLS policy, a trigger, a
        // constraint), the code would still show "Submitted!" with no way
        // to ever find out something actually went wrong. Photos would be
        // sitting in storage with no matching status change, exactly what
        // was happening here.
        if (error) throw new Error(`Could not save verification status: ${error.message}`)
      })

      await refreshProfile()
      setStep(3)

    } catch (err) {
      console.error('Identity verification error:', err)
      const msg = err?.message?.includes('fetch')
        ? 'Network error - check your connection and try again'
        : (err?.message || 'Submission failed - please try again')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDone = () => {
    if (returnTo) navigate(returnTo, { replace: true })
    else navigate('/search', { replace: true })
  }

  // Already verified
  if (alreadyVerified) {
    return (
      <div style={{ backgroundColor:'#FFFAF5', minHeight:'100vh', paddingTop:80 }}>
        <div className="max-w-sm mx-auto px-5 py-10 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor:'rgba(122,158,126,0.12)' }}>
            <Shield size={36} style={{ color:'#7A9E7E' }} />
          </div>
          <h1 className="font-display font-black text-2xl mb-2" style={{ color:'#1A1210' }}>You're Verified</h1>
          <p className="text-sm mb-8" style={{ color:'#8A7E78' }}>
            Your identity has been verified. You have full access to all DealMatch features.
          </p>
          <button onClick={handleDone}
            className="w-full py-4 rounded-2xl font-bold text-white"
            style={{ backgroundColor:'#C96A3A' }}>
            Continue →
          </button>
        </div>
      </div>
    )
  }

  // Already submitted, pending review
  if (alreadySubmitted && step !== 3) {
    return (
      <div style={{ backgroundColor:'#FFFAF5', minHeight:'100vh', paddingTop:80 }}>
        <div className="max-w-sm mx-auto px-5 py-10 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor:'rgba(212,168,83,0.12)' }}>
            <Shield size={36} style={{ color:'#D4A853' }} />
          </div>
          <h1 className="font-display font-black text-2xl mb-2" style={{ color:'#1A1210' }}>Under Review</h1>
          <p className="text-sm mb-4" style={{ color:'#8A7E78' }}>
            Your identity documents were submitted and are being reviewed. This usually takes under 24 hours.
          </p>
          <div className="rounded-2xl p-4 mb-8 text-left"
            style={{ backgroundColor:'rgba(212,168,83,0.08)', border:'1px solid rgba(212,168,83,0.2)' }}>
            <p className="text-xs font-semibold" style={{ color:'#D4A853' }}>What you can do while waiting:</p>
            <ul className="text-xs mt-2 space-y-1" style={{ color:'#8A7E78' }}>
              <li>• Browse and swipe properties</li>
              <li>• Book hotels and short-lets</li>
              <li>• Message matched contacts</li>
            </ul>
          </div>
          <button onClick={handleDone}
            className="w-full py-4 rounded-2xl font-bold text-white"
            style={{ backgroundColor:'#1A1210' }}>
            Continue Browsing →
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Done ─────────────────────────────────────────────────
  if (step === 3) {
    return (
      <div style={{ backgroundColor:'#FFFAF5', minHeight:'100vh', paddingTop:80 }}>
        <div className="max-w-sm mx-auto px-5 py-10 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor:'rgba(122,158,126,0.12)' }}>
            <Check size={36} style={{ color:'#7A9E7E' }} />
          </div>
          <h1 className="font-display font-black text-2xl mb-2" style={{ color:'#1A1210' }}>Submitted!</h1>
          <p className="text-sm mb-4" style={{ color:'#8A7E78' }}>
            Your ID and selfie have been uploaded. Our team will verify you within 24 hours.
          </p>
          <p className="text-xs mb-8 p-3 rounded-xl" style={{ color:'#8A7E78', backgroundColor:'rgba(26,18,16,0.04)' }}>
            You'll be able to {roleLabel} as soon as your verification is approved.
          </p>
          <button onClick={handleDone}
            className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor:'#C96A3A' }}>
            Start Exploring DealMatch
          </button>
        </div>
      </div>
    )
  }

  // ── Step 0: Intro ─────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div style={{ backgroundColor:'#FFFAF5', minHeight:'100vh', paddingTop:72 }}>
        <div className="max-w-sm mx-auto px-5 py-8">
          {/* Back button */}
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm mb-8"
            style={{ color:'rgba(26,18,16,0.4)' }}>
            <ArrowLeft size={14} /> Back
          </button>

          {/* Hero */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor:'rgba(201,106,58,0.1)' }}>
              <Shield size={36} style={{ color:'#C96A3A' }} />
            </div>
            <h1 className="font-display font-black text-3xl mb-2" style={{ color:'#1A1210' }}>Verify Your Identity</h1>
            <p className="text-sm" style={{ color:'#8A7E78' }}>
              Required to {roleLabel}. Takes about 2 minutes.
            </p>
          </div>

          {/* What you need */}
          <div className="space-y-3 mb-6">
            {[
              { icon: <CreditCard size={20} className="text-terracotta" />, title:'Government-issued ID', desc:'NIN slip, voter\'s card, passport, or driver\'s license' },
              { icon: <Camera size={20} className="text-terracotta" />, title:'A quick selfie', desc:'Your phone camera - no special equipment needed' },
              { icon: <Clock size={20} className="text-terracotta" />, title:'24-hour review', desc:'Our team reviews submissions manually for your security' },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3 p-4 rounded-2xl"
                style={{ backgroundColor:'rgba(26,18,16,0.03)', border:'1px solid #E8DDD2' }}>
                <span className="flex-shrink-0">{item.icon}</span>
                <div>
                  <p className="font-semibold text-sm" style={{ color:'#1A1210' }}>{item.title}</p>
                  <p className="text-xs mt-0.5" style={{ color:'#8A7E78' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 p-3 rounded-xl mb-6"
            style={{ backgroundColor:'rgba(122,158,126,0.06)', border:'1px solid rgba(122,158,126,0.2)' }}>
            <Lock size={13} style={{ color:'#7A9E7E', flexShrink:0, marginTop:2 }} />
            <p className="text-xs" style={{ color:'#8A7E78' }}>
              Your ID is stored encrypted and never shared publicly. Only used to confirm you are a real person.
            </p>
          </div>

          {/* What requires verification */}
          <div className="p-4 rounded-2xl mb-6"
            style={{ backgroundColor:'rgba(201,106,58,0.05)', border:'1px solid rgba(201,106,58,0.15)' }}>
            <p className="text-xs font-bold mb-2" style={{ color:'#C96A3A' }}>
              <Lock size={11} className="inline mr-1" />Requires verification
            </p>
            <ul className="text-xs space-y-1" style={{ color:'#8A7E78' }}>
              <li>• Expressing interest in buying a property</li>
              <li>• Listing a property for sale or rent</li>
              <li>• Signing tenancy agreements</li>
              <li>• Making or receiving protection payments</li>
            </ul>
            <p className="text-xs font-bold mt-3 mb-1" style={{ color:'#7A9E7E' }}>
              <Eye size={11} className="inline mr-1" />Free without verification
            </p>
            <ul className="text-xs space-y-1" style={{ color:'#8A7E78' }}>
              <li>• Browse and swipe all listings</li>
              <li>• Book hotels and short-lets</li>
              <li>• View professionals directory</li>
              <li>• Browse student hostels</li>
            </ul>
          </div>

          {/* CTA */}
          <button onClick={() => setStep(1)}
            className="w-full py-4 rounded-2xl font-bold text-white mb-3 flex items-center justify-center gap-2"
            style={{ backgroundColor:'#C96A3A', boxShadow:'0 4px 16px rgba(201,106,58,0.3)' }}>
            <Shield size={16} /> Verify Now - Free
          </button>

          {/* Skip button */}
          <button
            onClick={handleSkip}
            disabled={skipping}
            className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-70"
            style={{ color:'rgba(26,18,16,0.4)', border:'1px solid #E8DDD2', backgroundColor:'transparent' }}>
            <SkipForward size={14} />
            {skipping ? 'Skipping...' : 'Skip for now - browse freely'}
          </button>
          <p className="text-center text-xs mt-2" style={{ color:'rgba(26,18,16,0.3)' }}>
            You'll be reminded when you try to make a transaction
          </p>
        </div>
      </div>
    )
  }

  // ── Step 1: ID Upload ─────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ backgroundColor:'#FFFAF5', minHeight:'100vh', paddingTop:72 }}>
        <div className="max-w-sm mx-auto px-5 py-8">
          <button onClick={() => setStep(0)}
            className="flex items-center gap-2 text-sm mb-6" style={{ color:'rgba(26,18,16,0.4)' }}>
            <ArrowLeft size={14} /> Back
          </button>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            {['ID Document','Selfie','Done'].map((label, i) => (
              <React.Fragment key={label}>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: i < 1 ? '#C96A3A' : 'rgba(26,18,16,0.08)',
                      color: i < 1 ? 'white' : 'rgba(26,18,16,0.3)',
                    }}>
                    {i < 0 ? <Check size={14} /> : i + 1}
                  </div>
                  <span className="text-xs font-semibold hidden sm:block"
                    style={{ color: i === 0 ? '#1A1210' : 'rgba(26,18,16,0.3)' }}>{label}</span>
                </div>
                {i < 2 && <div className="flex-1 h-px" style={{ backgroundColor:'#E8DDD2' }} />}
              </React.Fragment>
            ))}
          </div>

          <h2 className="font-display font-black text-2xl mb-1" style={{ color:'#1A1210' }}>Upload your ID</h2>
          <p className="text-sm mb-6" style={{ color:'#8A7E78' }}>Choose the type and upload a clear photo.</p>

          {/* ID type selection - a single-select list rather than a grid of
              tiles: one clean container, hairline dividers between rows, a
              soft icon tile on the left and a checkmark on the right for
              the selected row. Nothing needs a heavy colored border to read
              as "selected" when the row itself already tells you. */}
          <div className="rounded-2xl overflow-hidden mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid #EDE4D8' }}>
            {ID_TYPES.map((t, i) => (
              <button key={t.id} onClick={() => setIdType(t.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
                style={{
                  backgroundColor: idType === t.id ? 'rgba(201,106,58,0.05)' : 'transparent',
                  borderTop: i === 0 ? 'none' : '1px solid #F2EAE0',
                }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: idType === t.id ? 'rgba(201,106,58,0.12)' : '#F5EDE0' }}>
                  {t.icon}
                </div>
                <span className="flex-1 text-sm font-semibold" style={{ color: '#1A1210' }}>
                  {t.label}
                </span>
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    backgroundColor: idType === t.id ? '#C96A3A' : 'transparent',
                    border: idType === t.id ? 'none' : '1.5px solid #E0D4C4',
                  }}>
                  {idType === t.id && <Check size={12} className="text-white" strokeWidth={3} />}
                </div>
              </button>
            ))}
          </div>

          {/* Upload area */}
          <label className="block cursor-pointer mb-5">
            {idPreview ? (
              <div className="relative rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(26,18,16,0.08)' }}>
                <img src={idPreview} alt="ID" className="w-full h-48 object-cover" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  style={{ backgroundColor:'rgba(26,18,16,0.45)' }}>
                  <span className="text-white text-xs font-semibold">Tap to replace</span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-10 text-center transition-colors"
                style={{ border: '1.5px dashed #DCCFBE', backgroundColor:'#FFFFFF' }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'rgba(201,106,58,0.08)' }}>
                  <Upload size={20} style={{ color:'#C96A3A' }} />
                </div>
                <p className="font-semibold text-sm" style={{ color:'#1A1210' }}>Upload ID Photo</p>
                <p className="text-xs mt-1" style={{ color:'#8A7E78' }}>JPG, PNG or WEBP - max 5MB</p>
              </div>
            )}
            <input ref={idFileRef} type="file" accept="image/*" className="hidden" onChange={handleIdUpload} />
          </label>

          <button
            onClick={() => {
              if (!idType) { toast.error('Select your ID type'); return }
              if (!idFile && !idPreview) { toast.error('Upload your ID photo'); return }
              setStep(2)
            }}
            className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor:'#C96A3A' }}>
            Next: Take Selfie <ArrowRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2: Selfie ────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor:'#FFFAF5', minHeight:'100vh', paddingTop:72 }}>
      <div className="max-w-sm mx-auto px-5 py-8">
        <button onClick={() => setStep(1)}
          className="flex items-center gap-2 text-sm mb-6" style={{ color:'rgba(26,18,16,0.4)' }}>
          <ArrowLeft size={14} /> Back
        </button>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {['ID Document','Selfie','Done'].map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: i <= 1 ? '#C96A3A' : 'rgba(26,18,16,0.08)',
                    color: i <= 1 ? 'white' : 'rgba(26,18,16,0.3)',
                  }}>
                  {i < 1 ? <Check size={14} /> : i + 1}
                </div>
                <span className="text-xs font-semibold hidden sm:block"
                  style={{ color: i === 1 ? '#1A1210' : 'rgba(26,18,16,0.3)' }}>{label}</span>
              </div>
              {i < 2 && <div className="flex-1 h-px" style={{ backgroundColor:'#E8DDD2' }} />}
            </React.Fragment>
          ))}
        </div>

        <h2 className="font-display font-black text-2xl mb-1" style={{ color:'#1A1210' }}>Take a selfie</h2>
        <p className="text-sm mb-6" style={{ color:'#8A7E78' }}>
          Look straight at the camera. Good lighting helps.
        </p>

        {/* Selfie capture area */}
        <div className="mb-5">
          {faceCapture ? (
            <div className="relative rounded-2xl overflow-hidden">
              <img src={faceCapture} alt="Selfie" className="w-full rounded-2xl" />
              <button onClick={retakePhoto}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor:'rgba(26,18,16,0.6)' }}>
                <X size={14} color="white" />
              </button>
            </div>
          ) : (
            <label htmlFor="selfie-input"
              className="relative rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-3 p-6 cursor-pointer"
              style={{ backgroundColor:'#1A1210', minHeight:240 }}>
              <Camera size={40} style={{ color:'rgba(255,255,255,0.4)' }} />
              <p className="text-xs text-center" style={{ color:'rgba(255,255,255,0.5)' }}>
                Tap to open your camera and take a selfie
              </p>
              {/* capture="user" hints mobile browsers to open the front
                  camera directly, same UX as the old custom camera view */}
              <input ref={faceFileRef} id="selfie-input" type="file" accept="image/*"
                capture="user" className="hidden" onChange={handleFaceUpload} />
            </label>
          )}
        </div>

        {/* Controls */}
        {faceCapture && (
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor:'#C96A3A' }}>
            {saving
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Shield size={16} /> Submit for Verification</>}
          </button>
        )}
      </div>
    </div>
  )
}
