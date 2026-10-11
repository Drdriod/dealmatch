/**
 * StudentVerifyPage - /student-verify
 * ════════════════════════════════════
 * Students upload their student ID to get verified.
 * Once approved (by admin/verifier), is_student_verified = true
 * and they can see owner contact details on hostel listings.
 *
 * This is completely FREE for students.
 * Security: Only verified students can view hostel owner contacts.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Check, ChevronDown, Clock, GraduationCap, Info, Shield, Upload, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

export default function StudentVerifyPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [institutions, setInstitutions] = useState([])
  const [existing,     setExisting]     = useState(null)  // existing verification record
  const [loading,      setLoading]      = useState(true)
  const [uploading,    setUploading]    = useState(false)
  const [previewUrl,   setPreviewUrl]   = useState('')
  const [saving,       setSaving]       = useState(false)

  const [form, setForm] = useState({
    institution_id:   '',
    institution_name: '',
    id_type:          'matric',   // 'matric' | 'jamb' | 'application'
    matric_number:    '',
    jamb_reg_number:  '',
    application_number: '',
    school_email:     '',
    id_image_url:     '',
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!user) { navigate('/auth?redirect=/student-verify'); return }
    loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    const [{ data: instData }, { data: verif }] = await Promise.all([
      supabase.from('institutions').select('id,name,short_name,state').order('name'),
      supabase.from('student_verifications').select('*').eq('user_id', user.id).maybeSingle(),
    ])
    setInstitutions(instData || [])
    setExisting(verif)
    if (verif) {
      setForm({
        institution_id:     verif.institution_id     || '',
        institution_name:   verif.institution_name   || '',
        id_type:            verif.application_number ? 'application'
                          : verif.jamb_reg_number    ? 'jamb'
                          : 'matric',
        matric_number:      verif.matric_number      || '',
        jamb_reg_number:    verif.jamb_reg_number    || '',
        application_number: verif.application_number || '',
        school_email:       verif.school_email       || '',
        id_image_url:       verif.id_image_url       || '',
      })
    }
    setLoading(false)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Image too large - max 5MB'); return }

    // Instant local preview - the actual bucket is private, so the
    // uploaded storage path can't be rendered directly as an <img src>.
    setPreviewUrl(URL.createObjectURL(file))

    setUploading(true)
    // ✅ SECURITY FIX: student ID cards were being stored in the fully
    // PUBLIC 'property-images' bucket (same one used for listing photos)
    // with a permanent public URL - anyone with the link could view a
    // student's ID with no login required. Now stored in the private
    // 'identity-docs' bucket instead, same as other identity documents.
    // Path must NOT repeat the bucket name - RLS checks that the first
    // folder segment equals auth.uid().
    // One fixed path per user, replaced in place on re-upload (no superseded copies).
    const path = `${user.id}/student-id`
    const { error } = await supabase.storage.from('identity-docs').upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
    if (error) { toast.error('Upload failed - please try again'); setUploading(false); return }
    // Store the storage PATH, not a public URL - bucket is private.
    // Admin generates a short-lived signed URL when reviewing submissions.
    setForm(f => ({ ...f, id_image_url: path }))
    setUploading(false)
    toast.success('ID photo uploaded')
  }

  const handleSubmit = async () => {
    if (!form.institution_id) { toast.error('Select your institution'); return }

    const usingMatric      = form.id_type === 'matric'
    const usingJamb        = form.id_type === 'jamb'
    const usingApplication = form.id_type === 'application'
    if (usingMatric      && !form.matric_number.trim())      { toast.error('Enter your matriculation number'); return }
    if (usingJamb        && !form.jamb_reg_number.trim())    { toast.error('Enter your JAMB registration number'); return }
    if (usingApplication && !form.application_number.trim()) { toast.error('Enter your application number'); return }
    if (!form.id_image_url) { toast.error('Please upload your student ID photo'); return }

    setSaving(true)
    try {
      const selectedInstitution = institutions.find(i => i.id === form.institution_id)
      const payload = {
        user_id:            user.id,
        institution_id:     form.institution_id,
        institution_name:   selectedInstitution?.name || form.institution_name,
        matric_number:      usingMatric      ? form.matric_number.trim().toUpperCase()      : null,
        jamb_reg_number:    usingJamb        ? form.jamb_reg_number.trim().toUpperCase()    : null,
        application_number: usingApplication ? form.application_number.trim().toUpperCase() : null,
        school_email:       form.school_email.trim() || null,
        id_image_url:       form.id_image_url,
        status:             'pending',
        updated_at:         new Date().toISOString(),
      }

      if (existing) {
        await supabase.from('student_verifications').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('student_verifications').insert(payload)
      }

      // Update profile with student institution
      await supabase.from('profiles').update({ student_institution: selectedInstitution?.name || '' }).eq('id', user.id)
      await refreshProfile()

      toast.success('Verification submitted! We\'ll review within 24 hours.')
      loadData()
    } catch (err) {
      toast.error('Submission failed - please try again')
      console.error(err)
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C85F2D' }} />
    </div>
  )

  const STATUS_META = {
    pending:  { label: 'Under Review',  color: '#D4A853', bg: 'rgba(212,168,83,0.08)',  border: 'rgba(212,168,83,0.2)',  icon: Clock    },
    approved: { label: 'Verified',   color: '#7A9E7E', bg: 'rgba(122,158,126,0.08)', border: 'rgba(122,158,126,0.2)', icon: Check    },
    rejected: { label: 'Rejected',      color: '#C85F2D', bg: 'rgba(200,95,45,0.08)',  border: 'rgba(200,95,45,0.2)',  icon: X        },
  }
  const statusMeta = existing ? STATUS_META[existing.status] : null

  return (
    <div style={{ backgroundColor: '#FFFAF5', minHeight: '100vh', paddingTop: 72 }}>
      <div className="max-w-md mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: '#F5EDE0' }}>
            <ArrowLeft size={16} style={{ color: '#17211B' }} />
          </button>
          <div>
            <h1 className="font-display font-black text-xl" style={{ color: '#17211B' }}>Student Verification</h1>
            <p className="text-xs" style={{ color: '#647068' }}>100% free - required to view owner contacts</p>
          </div>
        </div>

        {/* Status banner if already submitted */}
        {existing && statusMeta && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 mb-6 flex items-start gap-3"
            style={{ backgroundColor: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
            <statusMeta.icon size={16} style={{ color: statusMeta.color, flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="font-bold text-sm" style={{ color: statusMeta.color }}>
                Status: {statusMeta.label}
              </p>
              {existing.status === 'pending' && (
                <p className="text-xs mt-0.5" style={{ color: '#647068' }}>
                  We review within 24 hours. You'll be notified once approved.
                </p>
              )}
              {existing.status === 'approved' && (
                <p className="text-xs mt-0.5" style={{ color: '#647068' }}>
                  You can now view owner contact details on all hostel listings.{' '}
                  <Link to="/student-hostels" className="font-semibold underline" style={{ color: '#C85F2D' }}>Browse hostels →</Link>
                </p>
              )}
              {existing.status === 'rejected' && (
                <p className="text-xs mt-0.5" style={{ color: '#647068' }}>
                  {existing.rejection_reason || 'Your ID could not be verified. Please resubmit with a clearer photo.'}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Don't show form if approved */}
        {existing?.status === 'approved' ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgba(122,158,126,0.12)', border: '2px solid rgba(122,158,126,0.3)' }}>
              <GraduationCap size={36} style={{ color: '#7A9E7E' }} />
            </div>
            <h2 className="font-bold text-lg mb-2" style={{ color: '#17211B' }}>You're Verified!</h2>
            <p className="text-sm mb-6" style={{ color: '#647068' }}>
              You can now see direct contact details of hostel owners.
            </p>
            <Link to="/student-hostels"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm"
              style={{ backgroundColor: '#17211B', color: '#FFFAF5' }}>
              Browse Hostels <GraduationCap size={14} />
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Why verify */}
            <div className="rounded-2xl p-4 flex items-start gap-3"
              style={{ backgroundColor: 'rgba(200,95,45,0.06)', border: '1px solid rgba(200,95,45,0.15)' }}>
              <Info size={16} style={{ color: '#C85F2D', flexShrink: 0, marginTop: 2 }} />
              <div className="text-xs" style={{ color: '#647068' }}>
                <strong style={{ color: '#17211B' }}>Why we verify:</strong> Hostel owners listed here are real. We verify students so that owners know genuine students are contacting them - this keeps scams out on both sides.
              </div>
            </div>

            {/* Institution */}
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                Your School <span style={{ color: '#C85F2D' }}>*</span>
              </label>
              <div className="relative">
                <select value={form.institution_id} onChange={e => {
                  const inst = institutions.find(i => i.id === e.target.value)
                  setForm(f => ({ ...f, institution_id: e.target.value, institution_name: inst?.name || '' }))
                }}
                  className="w-full appearance-none rounded-xl px-4 py-3 text-sm outline-none pr-9"
                  style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: form.institution_id ? '#17211B' : '#647068' }}>
                  <option value="">Select your institution</option>
                  {institutions.map(i => <option key={i.id} value={i.id}>{i.short_name ? `${i.name} (${i.short_name})` : i.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#647068' }} />
              </div>
            </div>

            {/* ID type selector */}
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                Student ID Type <span style={{ color: '#C85F2D' }}>*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'matric',      label: 'Matric No.',       sub: 'Returning students'    },
                  { id: 'jamb',        label: 'JAMB Reg No.',     sub: 'Freshers / 100 level'  },
                  { id: 'application', label: 'Application No.',  sub: 'Pre-admission / form'  },
                ].map(opt => (
                  <button key={opt.id} type="button"
                    onClick={() => setForm(f => ({ ...f, id_type: opt.id }))}
                    className="p-3 rounded-xl text-left transition-all"
                    style={{
                      backgroundColor: form.id_type === opt.id ? 'rgba(200,95,45,0.08)' : '#F5EDE0',
                      border: `1.5px solid ${form.id_type === opt.id ? '#C85F2D' : 'transparent'}`,
                    }}>
                    <div className="text-xs font-bold leading-tight" style={{ color: form.id_type === opt.id ? '#C85F2D' : '#17211B' }}>
                      {opt.label}
                    </div>
                    <div className="text-xs mt-0.5 leading-tight" style={{ color: '#647068' }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Matric number */}
            {form.id_type === 'matric' && (
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                  Matriculation Number <span style={{ color: '#C85F2D' }}>*</span>
                </label>
                <input value={form.matric_number} onChange={set('matric_number')}
                  placeholder="e.g. 190401045" autoCapitalize="characters"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono"
                  style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: '#17211B' }} />
                <p className="text-xs mt-1" style={{ color: '#647068' }}>
                  The number on your student ID card issued by your institution.
                </p>
              </div>
            )}

            {/* JAMB reg number */}
            {form.id_type === 'jamb' && (
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                  JAMB Registration Number <span style={{ color: '#C85F2D' }}>*</span>
                </label>
                <input value={form.jamb_reg_number} onChange={set('jamb_reg_number')}
                  placeholder="e.g. 20376549AB" autoCapitalize="characters" maxLength={12}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono"
                  style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: '#17211B' }} />
                <p className="text-xs mt-1" style={{ color: '#647068' }}>
                  Found on your JAMB result slip, admission letter, or JAMB profile.
                  You can update to your matric number once your school assigns one.
                </p>
              </div>
            )}

            {/* Application number */}
            {form.id_type === 'application' && (
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                  Application Number <span style={{ color: '#C85F2D' }}>*</span>
                </label>
                <input value={form.application_number} onChange={set('application_number')}
                  placeholder="e.g. APP/2024/00123" autoCapitalize="characters"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono"
                  style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: '#17211B' }} />
                <p className="text-xs mt-1" style={{ color: '#647068' }}>
                  The number given to you when you purchased your admission form or registered on your school's portal.
                  Usually found on your acknowledgement slip or email.
                </p>
              </div>
            )}

            {/* School email */}
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                School Email <span style={{ color: '#647068', fontWeight: 400 }}>(optional - speeds up approval)</span>
              </label>
              <input value={form.school_email} onChange={set('school_email')}
                type="email" placeholder="username@unilag.edu.ng"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: '#17211B' }} />
            </div>

            {/* Student ID upload */}
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                Student ID Card Photo <span style={{ color: '#C85F2D' }}>*</span>
              </label>
              <label className="block cursor-pointer">
                {previewUrl ? (
                  <div className="relative rounded-2xl overflow-hidden">
                    <img src={previewUrl} alt="Student ID" className="w-full h-40 object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(23,33,27,0.4)' }}>
                      <span className="text-white text-xs font-semibold">Click to replace</span>
                    </div>
                  </div>
                ) : form.id_image_url ? (
                  <div className="relative rounded-2xl overflow-hidden flex items-center justify-center"
                    style={{ height: 160, backgroundColor: '#F5EDE0' }}>
                    <span className="text-xs font-semibold" style={{ color: '#647068' }}>ID photo already uploaded ✓ - click to replace</span>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-2xl p-8 text-center"
                    style={{ borderColor: '#DEDDD6', backgroundColor: '#F5EDE0' }}>
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm" style={{ color: '#647068' }}>Uploading…</span>
                      </div>
                    ) : (
                      <>
                        <Upload size={24} style={{ color: '#C85F2D', margin: '0 auto 8px' }} />
                        <p className="text-sm font-semibold" style={{ color: '#17211B' }}>Upload your student ID</p>
                        <p className="text-xs mt-1" style={{ color: '#647068' }}>
                          NIN card, school ID card, or any valid student ID
                        </p>
                      </>
                    )}
                  </div>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
              </label>
              <p className="text-xs mt-1.5" style={{ color: '#647068' }}>
                Your ID is stored securely and only used for verification. It's never shared publicly.
              </p>
            </div>

            {/* Privacy note */}
            <div className="rounded-2xl p-3 flex items-start gap-2"
              style={{ backgroundColor: 'rgba(122,158,126,0.06)', border: '1px solid rgba(122,158,126,0.15)' }}>
              <Shield size={14} style={{ color: '#7A9E7E', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: '#647068' }}>
                Your student ID and personal details are kept private and never shown to hostel owners. Only your verified status is shared.
              </p>
            </div>

            <button onClick={handleSubmit}
              disabled={
                saving || uploading || !form.institution_id || !form.id_image_url ||
                (form.id_type === 'matric'      && !form.matric_number.trim())      ||
                (form.id_type === 'jamb'        && !form.jamb_reg_number.trim())    ||
                (form.id_type === 'application' && !form.application_number.trim())
              }
              className="w-full py-4 rounded-2xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#17211B', color: '#FFFAF5' }}>
              {saving
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><GraduationCap size={16} /> Submit for Verification - Free</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
