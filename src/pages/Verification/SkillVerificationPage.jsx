/**
 * SkillVerificationPage - /verify-skill
 *
 * Level 2 of ADR-008's Identity -> Skill -> Trusted ladder. Portfolio-
 * first by design, per the handoff spec (section 5, Step 2): "This is
 * more important than certificates for artisans." Certificates/years-of-
 * experience are optional context, not gatekeeping requirements.
 *
 * Submission never touches verified_providers or profiles directly -- it
 * calls submit_verification(level=2, ...), a SECURITY DEFINER RPC that
 * only ever inserts a *pending* row into verification_submissions. The
 * provider cannot self-approve; only staff, via
 * review_verification_submission(), can move verified_providers.level.
 * See supabase/migrations/20260812000000_production_hardening.sql.
 */
import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, CheckCircle2, Clock, ShieldCheck, Upload, X, Award } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadSkillVerificationState, submitSkillVerification } from '@/data/verificationRepository'
import { useAuth } from '@/context/AuthContext'
import VerifyReminder from '@/components/ui/VerifyReminder'
import toast from 'react-hot-toast'

export default function SkillVerificationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuth()
  const [category, setCategory] = useState('')
  // Onboarding passes the chosen kind of work; fall back to the old default.
  const startType = ['artisan', 'tutor', 'home_service', 'other_skill'].includes(location.state?.categoryType) ? location.state.categoryType : 'artisan'
  const [categoryType, setCategoryType] = useState(startType)
  const [area, setArea] = useState(profile?.city || '')
  const [description, setDescription] = useState('')
  const [yearsExperience, setYearsExperience] = useState('')
  const [references, setReferences] = useState('')
  const [openPrice, setOpenPrice] = useState(true)
  const [price, setPrice] = useState('')
  const [files, setFiles] = useState([]) // { file, previewUrl }
  const [submitting, setSubmitting] = useState(false)
  const [existing, setExisting] = useState(null) // most recent submission, if any
  const [currentLevel, setCurrentLevel] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user?.id) load() }, [user?.id])
  // Profile can finish loading after first render: fill the work area once.
  useEffect(() => { if (profile?.city) setArea(a => a || profile.city) }, [profile?.city])

  const load = async () => {
    setLoading(true)
    const [{ data: sub }, { data: vp }] = await loadSkillVerificationState(user.id)
    setExisting(sub || null)
    setCurrentLevel(vp?.level || 0)
    setLoading(false)
  }

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []).slice(0, 6 - files.length)
    const withPreviews = picked.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))
    setFiles(f => [...f, ...withPreviews])
  }
  const removeFile = (i) => setFiles(f => f.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    if (!description.trim()) { toast.error('Describe the work you do'); return }
    if (files.length === 0) { toast.error('Add at least one photo of your work'); return }

    setSubmitting(true)
    try {
      const uploadedPaths = []
      for (const { file } of files) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${user.id}/portfolio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
        const { error } = await supabase.storage.from('provider-portfolio').upload(path, file, { upsert: true })
        if (error) throw new Error(`Upload failed: ${error.message}`)
        uploadedPaths.push(path) // storage path, not a public URL -- bucket is private; staff view via signed URLs
      }

      const { error: rpcError } = await submitSkillVerification({
        category: category.trim() || null,
        category_type: categoryType,
        area: area.trim() || null,
        description: description.trim(),
        years_experience: yearsExperience ? Number(yearsExperience) : null,
        references: references.trim() || null,
        price_cents: (!openPrice && price) ? Math.round(Number(price) * 100) : null,
        open_price: openPrice,
        portfolio_paths: uploadedPaths,
        submitted_at: new Date().toISOString(),
      })
      if (rpcError) throw rpcError

      toast.success('Submitted for review!')
      load()
    } catch (err) {
      toast.error(err.message || 'Could not submit. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EEE9DE' }}>
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#C85F2D', borderTopColor: 'transparent' }} />
    </div>
  }

  const NumberedLabel = ({ n, children }) => (
    <label className="text-xs font-bold flex items-center gap-2 mb-1.5" style={{ color: '#17211B' }}>
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0"
        style={{ backgroundColor: 'rgba(200,95,45,0.12)', color: '#C85F2D' }}>{n}</span>
      {children}
    </label>
  )

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#EEE9DE' }}>
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFF' }}>
          <ArrowLeft size={16} style={{ color: '#17211B' }} />
        </button>
        <div>
          <h1 className="font-display text-lg font-black" style={{ color: '#17211B' }}>Skill Verification</h1>
          <p className="text-xs" style={{ color: '#647068' }}>Show your work - photos matter more than certificates</p>
        </div>
      </div>

      <VerifyReminder returnTo="/verify-skill" className="mx-4 mt-2 max-w-4xl md:mx-auto" />

      {currentLevel >= 2 ? (
        <div className="mx-4 mt-4 rounded-2xl p-6 text-center" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
          <Award size={36} className="mx-auto mb-3" style={{ color: '#D4A853' }} />
          <p className="font-semibold text-sm" style={{ color: '#17211B' }}>You're Skill Verified{currentLevel >= 3 ? ' & Trusted' : ''}!</p>
          <p className="text-xs mt-1" style={{ color: '#647068' }}>You now appear in Find a Provider search results.</p>
        </div>
      ) : existing?.status === 'pending' ? (
        <div className="mx-4 mt-4 rounded-2xl p-6 text-center" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
          <Clock size={32} className="mx-auto mb-3" style={{ color: '#D4A853' }} />
          <p className="font-semibold text-sm" style={{ color: '#17211B' }}>Under review</p>
          <p className="text-xs mt-1" style={{ color: '#647068' }}>Submitted {new Date(existing.created_at).toLocaleDateString()}. Our team typically reviews within 48 hours.</p>
        </div>
      ) : (
        <div className="px-4 mt-4 max-w-4xl mx-auto md:grid md:grid-cols-[300px,1fr] md:gap-8">

          {/* Live photo preview - mirrors the reference design's photo-left
              layout, using the applicant's own uploaded work photos. */}
          <div className="hidden md:block">
            <div className="rounded-3xl overflow-hidden sticky top-4" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
              <div className="aspect-[4/5] relative" style={{ backgroundColor: 'rgba(200,95,45,0.06)' }}>
                {files[0]
                  ? <img src={files[0].previewUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      <Camera size={28} style={{ color: '#D8C4AE' }} />
                      <span className="text-xs" style={{ color: '#B5A99C' }}>Your first photo appears here</span>
                    </div>}
              </div>
              {files.length > 0 && (
                <div className="p-3 grid grid-cols-4 gap-1.5">
                  {files.slice(0, 4).map((f, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden">
                      <img src={f.previewUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
          {existing?.status === 'rejected' && (
            <div className="rounded-2xl p-3 text-xs" style={{ backgroundColor: 'rgba(201,74,58,0.08)', color: '#C94A3A' }}>
              Your last submission wasn't approved. Add clearer photos or more detail and resubmit below.
            </div>
          )}

          <div>
            <NumberedLabel n={1}>Which best describes you? *</NumberedLabel>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'artisan',     label: 'Artisan' },
                { id: 'tutor',       label: 'Tutor' },
                { id: 'home_service', label: 'Home Service' },
                { id: 'other_skill', label: 'Other Skill' },
                { id: 'property_professional', label: 'Property Professional' },
              ].map(opt => (
                <button key={opt.id} type="button" onClick={() => setCategoryType(opt.id)}
                  className="px-3.5 py-2 rounded-full text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: categoryType === opt.id ? '#C85F2D' : '#FFF',
                    color: categoryType === opt.id ? '#FFF' : '#17211B',
                    border: '1px solid #DEDDD6',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <NumberedLabel n={2}>What do you do? *</NumberedLabel>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Plumbing, Electrical, Catering, Tailoring"
              className="w-full px-4 py-3 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }} />
          </div>

          <div>
            <NumberedLabel n={3}>Area *</NumberedLabel>
            <input value={area} onChange={e => setArea(e.target.value)} placeholder="e.g. Lekki, Lagos"
              className="w-full px-4 py-3 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }} />
          </div>

          <div>
            <NumberedLabel n={4}>Price</NumberedLabel>
            <div className="flex items-center gap-2 mb-2">
              <button type="button" onClick={() => setOpenPrice(true)}
                className="px-3.5 py-2 rounded-full text-xs font-semibold transition-colors"
                style={{ backgroundColor: openPrice ? '#C85F2D' : '#FFF', color: openPrice ? '#FFF' : '#17211B', border: '1px solid #DEDDD6' }}>
                Open price
              </button>
              <button type="button" onClick={() => setOpenPrice(false)}
                className="px-3.5 py-2 rounded-full text-xs font-semibold transition-colors"
                style={{ backgroundColor: !openPrice ? '#C85F2D' : '#FFF', color: !openPrice ? '#FFF' : '#17211B', border: '1px solid #DEDDD6' }}>
                Set a starting price
              </button>
            </div>
            {!openPrice && (
              <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 5000"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }} />
            )}
          </div>

          <div>
            <NumberedLabel n={5}>Describe your experience *</NumberedLabel>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
              placeholder="What kind of jobs have you done? How long have you been doing this work?"
              className="w-full px-4 py-3 rounded-2xl text-sm outline-none resize-none" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <NumberedLabel n={6}>Years of experience</NumberedLabel>
              <input type="number" min="0" value={yearsExperience} onChange={e => setYearsExperience(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }} />
            </div>
            <div>
              <NumberedLabel n={7}>References</NumberedLabel>
              <input value={references} onChange={e => setReferences(e.target.value)} placeholder="Names or phone numbers"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }} />
            </div>
          </div>

          <div>
            <NumberedLabel n={8}>Photos of your work * <span className="font-normal ml-1" style={{ color: '#647068' }}>(up to 6)</span></NumberedLabel>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                  <img src={f.previewUrl} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeFile(i)} className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                    <X size={11} className="text-white" />
                  </button>
                </div>
              ))}
              {files.length < 6 && (
                <label className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer" style={{ backgroundColor: '#FFF', border: '1.5px dashed #DEDDD6' }}>
                  <Camera size={18} style={{ color: '#647068' }} />
                  <span className="text-[10px] font-semibold" style={{ color: '#647068' }}>Add</span>
                  <input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <button onClick={handleSubmit} disabled={submitting}
            className="w-full py-3.5 rounded-full font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-transform hover:scale-[1.01]"
            style={{ backgroundColor: '#C85F2D' }}>
            {submitting ? 'Submitting…' : <><Upload size={15} /> Submit for review</>}
          </button>
          <p className="text-[11px] text-center" style={{ color: '#647068' }}>
            Reviewed by our team, usually within 48 hours. You'll be notified either way.
          </p>
          </div>
        </div>
      )}
    </div>
  )
}
