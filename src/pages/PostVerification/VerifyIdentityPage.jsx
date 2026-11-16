/**
 * VerifyIdentityPage - /verify-identity
 * ══════════════════════════════════════
 * Universal identity verification for ALL non-student roles.
 *
 * Three steps: your ID, a selfie, then a review before submitting.
 *
 * ROLE SYSTEM (what verification unlocks):
 *   buyer / seller / renter / landlord / investor / agent / lender
 *
 * SKIP POLICY:
 * - Users may skip verification to browse, swipe, book hotels/short-lets
 * - Verification wall blocks ONLY: buying interest, listing, tenancy, escrow
 * - Skip preference is stored in profile.verification_skipped = true
 * - On any blocked action, user is redirected back here
 *
 * STUDENT CONFLICT:
 * - Students use /student-verify (separate flow, separate table)
 * - Students who also want to buy/sell use BOTH flows independently
 *
 * Photos cannot be saved on the device, and the NIN/BVN is sensitive, so this
 * page deliberately does not keep a local draft.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowPathIcon, ArrowUpTrayIcon, BookOpenIcon, CameraIcon, CheckCircleIcon, ClockIcon, CreditCardIcon,
  IdentificationIcon, LockClosedIcon, PencilSquareIcon, ShieldCheckIcon, TruckIcon, UserGroupIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { uploadFile } from '@/data/storageRepository'
import { supabase } from '@/lib/supabase'
import { markVerificationSkipped, fetchLiveVerified, saveIdentitySubmission } from '@/data/identityVerificationRepository'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import { WizardShell, WizardActions, StepHeading, Field, ChoiceCard, InfoBox, inputClass } from '@/components/ui/WizardKit'

const ID_TYPES = [
  { id: 'nin',      label: 'NIN slip or card',       icon: IdentificationIcon },
  { id: 'voters',   label: "Voter's card",           icon: UserGroupIcon },
  { id: 'passport', label: 'International passport', icon: BookOpenIcon },
  { id: 'drivers',  label: "Driver's licence",       icon: TruckIcon },
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

const STEPS = ['Your ID', 'Selfie', 'Review']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Problems per step, keyed by field.
function validate(step, { idType, idFile, nin, faceFile }) {
  const e = {}
  if (step === 0) {
    if (!idType) e.idType = 'Choose the type of ID you will upload'
    if (!idFile) e.idFile = 'Upload a clear photo of your ID'
    if (nin.length !== 11) e.nin = 'Enter your 11-digit NIN or BVN'
  }
  if (step === 1 && !faceFile) e.faceFile = 'Take or choose a selfie'
  return e
}

// A centred message screen: verified, under review, or just submitted.
function StatusScreen({ tone = 'forest', icon: Icon, title, children, actionLabel, onAction }) {
  const ring = tone === 'sun' ? 'bg-sun/25 text-terracotta-dark' : 'bg-forest-pale text-forest'
  return (
    <div className="flex min-h-screen items-start justify-center bg-cream px-4 pb-24 pt-16 text-deep">
      <div className="w-full max-w-md rounded-[40px_40px_40px_12px] border border-white/70 bg-white/85 p-8 text-center shadow-soft backdrop-blur-xl">
        <span className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px_22px_22px_8px] ${ring}`}>
          <Icon className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mb-2 font-display text-3xl">{title}</h1>
        <div className="space-y-3 text-sm text-warm">{children}</div>
        <button type="button" onClick={onAction} className="btn-primary mt-7 w-full !py-3.5 text-[15px]">{actionLabel}</button>
      </div>
    </div>
  )
}

export default function VerifyIdentityPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Where to redirect after skip or completion
  const returnTo = location.state?.returnTo || null

  const [step, setStep] = useState(0)
  const [idType, setIdType] = useState('')
  const [idFile, setIdFile] = useState(null)
  const [idPreview, setIdPreview] = useState(null)
  const [faceFile, setFaceFile] = useState(null) // compressed Blob to upload
  const [facePreview, setFacePreview] = useState(null)
  const [nin, setNin] = useState('')
  const [fileErrors, setFileErrors] = useState({})
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const firstRender = useRef(true)
  const previews = useRef({})
  previews.current = { idPreview, facePreview }

  // Release the preview images when leaving the page.
  useEffect(() => () => {
    Object.values(previews.current).forEach((u) => { if (u) URL.revokeObjectURL(u) })
  }, [])

  const role = profile?.role || 'buyer'
  const roleLabel = ROLE_LABELS[role] || 'complete transactions'
  const alreadySubmitted = profile?.identity_verification_status === 'submitted'
  const alreadyVerified = profile?.is_photo_verified && profile?.is_live_verified

  const errors = { ...validate(step, { idType, idFile, nin, faceFile }) }
  const errorKeys = Object.keys(errors)
  const shown = showErrors ? errors : {}

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.getElementById('wizard-step-title')?.focus({ preventScroll: true })
    setShowErrors(false)
  }, [step])

  const handleDone = () => navigate(returnTo || '/search', { replace: true })

  // ── Skip verification ────────────────────────────────────────────
  const handleSkip = async () => {
    setSkipping(true)
    try {
      await markVerificationSkipped(user.id)
      await refreshProfile()
      toast('Verification skipped. You can verify anytime from your profile.', { icon: 'ℹ️', duration: 4000 })
      handleDone()
    } catch {
      toast.error('Could not skip. Please try again.')
    }
    setSkipping(false)
  }

  // ── ID document ──────────────────────────────────────────────────
  const handleIdUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) { setFileErrors((f) => ({ ...f, id: 'Please use a JPG, PNG or WEBP image' })); return }
    if (file.size > 5 * 1024 * 1024) { setFileErrors((f) => ({ ...f, id: 'That file is over 5 MB. Choose a smaller photo.' })); return }
    setFileErrors((f) => ({ ...f, id: '' }))
    if (idPreview) URL.revokeObjectURL(idPreview)
    setIdFile(file)
    setIdPreview(URL.createObjectURL(file))
  }

  // ── Selfie (native file input; compressed in a throwaway canvas) ─
  const handleFaceUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) { setFileErrors((f) => ({ ...f, face: 'Please use a JPG, PNG or WEBP image' })); return }
    if (file.size > 8 * 1024 * 1024) { setFileErrors((f) => ({ ...f, face: 'That file is over 8 MB. Choose a smaller photo.' })); return }
    setFileErrors((f) => ({ ...f, face: '' }))

    const objectUrl = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      const MAX_DIMENSION = 1280
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl)
        if (!blob) { setFileErrors((f) => ({ ...f, face: 'Could not process that image. Please try another photo.' })); return }
        if (facePreview) URL.revokeObjectURL(facePreview)
        setFaceFile(blob)
        setFacePreview(URL.createObjectURL(blob))
      }, 'image/jpeg', 0.85)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      setFileErrors((f) => ({ ...f, face: 'Could not read that image. Please try another photo.' }))
    }
    img.src = objectUrl
  }

  const retakePhoto = () => {
    if (facePreview) URL.revokeObjectURL(facePreview)
    setFacePreview(null)
    setFaceFile(null)
  }

  // ── Final submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true)
    try {
      // The NIN/BVN is hashed on the server before anything is stored (SEC-1).
      // The browser never keeps or writes the hash itself.
      const { data: sess } = await supabase.auth.getSession()
      const ninRes = await fetch('/api/platform?resource=identity-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess?.session?.access_token || ''}` },
        body: JSON.stringify({ nin }),
      })
      if (!ninRes.ok) {
        const j = await ninRes.json().catch(() => ({}))
        toast.error(j.error || 'Could not save your NIN/BVN. Please try again.')
        return
      }

      const { data: freshProfile } = await fetchLiveVerified(user.id)
      if (freshProfile?.is_live_verified) {
        toast.success('You are already verified!')
        navigate(returnTo || '/browse', { replace: true })
        return
      }

      // One fixed path per document per user. A re-upload replaces the
      // existing object in place. Paths must NOT repeat the bucket name: RLS
      // checks that the first folder segment equals auth.uid().
      const idPath = `${user.id}/id-document`
      const facePath = `${user.id}/selfie`

      // Identity documents stay in the PRIVATE bucket; there is no public fallback.
      const { error: idErr } = await uploadFile('identity-docs', idPath, idFile, { upsert: true, contentType: idFile.type || 'image/jpeg' })
      if (idErr) throw new Error(`ID upload failed: ${idErr.message}`)

      const { error: faceErr } = await uploadFile('identity-docs', facePath, faceFile, { upsert: true, contentType: 'image/jpeg' })
      if (faceErr) throw new Error(`Selfie upload failed: ${faceErr.message}`)

      // Store the storage paths (not public URLs). Admin generates short-lived
      // signed URLs when viewing submissions.
      const { error } = await saveIdentitySubmission(user.id, {
        identity_photo_url: idPath,
        identity_selfie_url: facePath,
        identity_doc_type: idType,
        identity_verification_status: 'submitted',
        verification_skipped: false,
        // SECURITY: is_photo_verified / is_live_verified are set ONLY by an admin
      })
      // A failed status update must not look like success.
      if (error) throw new Error(`Could not save verification status: ${error.message}`)

      await refreshProfile()
      setSubmitted(true)
    } catch (err) {
      console.error('Identity verification error:', err)
      const msg = err?.message?.includes('fetch')
        ? 'Network error. Check your connection and try again.'
        : (err?.message || 'Submission failed. Please try again.')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const goNext = () => {
    if (errorKeys.length) {
      setShowErrors(true)
      const first = document.querySelector(`[data-field="f-${errorKeys[0]}"]`)
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      first?.querySelector('input,select,textarea,button')?.focus({ preventScroll: true })
      return
    }
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else handleSubmit()
  }

  // ── Message screens ──────────────────────────────────────────────
  if (alreadyVerified) {
    return (
      <StatusScreen icon={ShieldCheckIcon} title="You're verified" actionLabel="Continue" onAction={handleDone}>
        <p>Your identity has been verified. You have full access to all DealMatch features.</p>
      </StatusScreen>
    )
  }

  if (submitted) {
    return (
      <StatusScreen icon={CheckCircleIcon} title="Submitted" actionLabel="Start exploring DealMatch" onAction={handleDone}>
        <p>Your ID and selfie have been uploaded. Our team will verify you within 24 hours.</p>
        <p className="rounded-2xl bg-cream-deep p-3 text-xs">You&apos;ll be able to {roleLabel} as soon as your verification is approved.</p>
      </StatusScreen>
    )
  }

  if (alreadySubmitted) {
    return (
      <StatusScreen tone="sun" icon={ClockIcon} title="Under review" actionLabel="Continue browsing" onAction={handleDone}>
        <p>Your identity documents were submitted and are being reviewed. This usually takes under 24 hours.</p>
        <div className="rounded-2xl border border-sun/50 bg-sun/15 p-4 text-left text-xs text-deep">
          <p className="mb-1.5 font-bold">What you can do while waiting</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Browse and swipe properties</li>
            <li>Book hotels and short-lets</li>
            <li>Message matched contacts</li>
          </ul>
        </div>
      </StatusScreen>
    )
  }

  const idLabel = ID_TYPES.find((t) => t.id === idType)?.label

  const intro = (
    <div className="mb-5">
      <InfoBox icon={LockClosedIcon} title={`Required to ${roleLabel}`}>
        It takes about 2 minutes and is free. Your ID is stored encrypted and never shown publicly. It is only used to confirm you are a real person.
      </InfoBox>
    </div>
  )

  return (
    <>
      <WizardShell
        eyebrow="Identity check"
        title="Verify your identity"
        subtitle="Upload your ID, add a selfie, then check everything before you send it."
        steps={STEPS}
        step={step}
        onStepClick={(i) => setStep(i)}
        notice={step === 0 ? intro : null}
      >
        {step === 0 && (
          <div className="space-y-6">
            <StepHeading title="Your ID">Choose the type, then add a clear photo and your number.</StepHeading>

            <Field id="f-idType" label="Type of ID" error={shown.idType}>
              <div role="radiogroup" aria-label="Type of ID" className="grid grid-cols-2 gap-2.5">
                {ID_TYPES.map((t) => (
                  <ChoiceCard key={t.id} selected={idType === t.id} onClick={() => setIdType(t.id)} icon={t.icon} label={t.label} />
                ))}
              </div>
            </Field>

            <div data-field="f-idFile">
              <p className="mb-1.5 text-sm font-bold">Photo of your ID</p>
              <label className="group relative block cursor-pointer">
                <input type="file" accept="image/*" className="peer sr-only" onChange={handleIdUpload}
                  aria-label="Upload a photo of your ID" aria-invalid={shown.idFile || fileErrors.id ? true : undefined} />
                {idPreview ? (
                  <span className="relative block overflow-hidden rounded-[24px_24px_24px_8px] border border-line peer-focus-visible:ring-2 peer-focus-visible:ring-terracotta">
                    <img src={idPreview} alt="Your ID" className="h-48 w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-deep/60 py-2 text-xs font-bold text-white backdrop-blur-sm">
                      <ArrowPathIcon className="h-4 w-4" aria-hidden="true" /> Tap to replace
                    </span>
                  </span>
                ) : (
                  <span className={`flex flex-col items-center rounded-[24px_24px_24px_8px] border-2 border-dashed bg-white p-8 text-center transition-colors group-hover:border-deep/30 peer-focus-visible:ring-2 peer-focus-visible:ring-terracotta ${shown.idFile || fileErrors.id ? 'border-terracotta' : 'border-line'}`}>
                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-pale text-terracotta">
                      <ArrowUpTrayIcon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-bold">Add a photo of your ID</span>
                    <span className="mt-1 text-xs text-warm">JPG, PNG or WEBP, up to 5 MB. Make sure every corner shows.</span>
                  </span>
                )}
              </label>
              {(shown.idFile || fileErrors.id) ? (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-terracotta-dark">{fileErrors.id || shown.idFile}</p>
              ) : null}
            </div>

            <Field id="f-nin" label="Your NIN or BVN" hint="11 digits. Used only to stop duplicate accounts. Stored as a secure hash, never in plain text." error={shown.nin}>
              <input inputMode="numeric" autoComplete="off" maxLength={11} value={nin}
                onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="e.g. 12345678901" className={`input ${inputClass}`} />
            </Field>

            <div className="border-t border-line pt-4 text-center">
              <button type="button" onClick={handleSkip} disabled={skipping}
                className="text-sm font-bold text-warm underline-offset-2 hover:text-deep hover:underline disabled:opacity-50">
                {skipping ? 'Skipping…' : 'Skip for now and browse freely'}
              </button>
              <p className="mt-1 text-xs text-warm">You will be asked again when you list, pay or sign something.</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <StepHeading title="Take a selfie">Look straight at the camera in good light.</StepHeading>

            <div data-field="f-faceFile">
              {facePreview ? (
                <div className="relative overflow-hidden rounded-[28px_28px_28px_10px] border border-line">
                  <img src={facePreview} alt="Your selfie" className="max-h-[28rem] w-full object-cover" />
                  <button type="button" onClick={retakePhoto}
                    className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-deep/70 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm hover:bg-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <XMarkIcon className="h-4 w-4" aria-hidden="true" /> Retake
                  </button>
                </div>
              ) : (
                <label className="group relative block cursor-pointer">
                  {/* capture="user" opens the front camera directly on phones */}
                  <input type="file" accept="image/*" capture="user" className="peer sr-only" onChange={handleFaceUpload}
                    aria-label="Take a selfie" aria-invalid={shown.faceFile || fileErrors.face ? true : undefined} />
                  <span className={`flex min-h-[15rem] flex-col items-center justify-center gap-3 rounded-[28px_28px_28px_10px] bg-forest-dark p-6 text-center text-white transition-colors group-hover:bg-forest peer-focus-visible:ring-2 peer-focus-visible:ring-terracotta peer-focus-visible:ring-offset-2 ${shown.faceFile || fileErrors.face ? 'ring-2 ring-terracotta' : ''}`}>
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
                      <CameraIcon className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-bold">Tap to open your camera</span>
                    <span className="text-xs text-white/70">Or choose a recent photo of your face</span>
                  </span>
                </label>
              )}
              {(shown.faceFile || fileErrors.face) ? (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-terracotta-dark">{fileErrors.face || shown.faceFile}</p>
              ) : null}
            </div>

            <InfoBox title="For a quick approval">
              Face the camera, keep your whole face in the frame, and avoid hats or sunglasses.
            </InfoBox>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <StepHeading title="Review and submit">Check that both photos are clear and your details are right.</StepHeading>

            <ul className="divide-y divide-line rounded-[24px_24px_24px_8px] border border-line bg-white">
              <li className="flex items-center gap-3 p-4">
                {idPreview ? <img src={idPreview} alt="" className="h-14 w-20 flex-shrink-0 rounded-xl object-cover" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-warm">ID</p>
                  <p className="truncate text-sm font-bold">{idLabel}</p>
                </div>
                <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-deep/30">
                  <PencilSquareIcon className="h-4 w-4" aria-hidden="true" /> Edit
                </button>
              </li>
              <li className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-warm">NIN or BVN</p>
                  <p className="text-sm font-bold tracking-wider">{'•'.repeat(8)}{nin.slice(-3)}</p>
                </div>
                <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-deep/30">
                  <PencilSquareIcon className="h-4 w-4" aria-hidden="true" /> Edit
                </button>
              </li>
              <li className="flex items-center gap-3 p-4">
                {facePreview ? <img src={facePreview} alt="" className="h-14 w-14 flex-shrink-0 rounded-full object-cover" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-warm">Selfie</p>
                  <p className="text-sm font-bold">Ready to send</p>
                </div>
                <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-deep/30">
                  <PencilSquareIcon className="h-4 w-4" aria-hidden="true" /> Edit
                </button>
              </li>
            </ul>

            <InfoBox icon={ClockIcon} title="What happens next">
              Our team reviews every submission by hand, usually within 24 hours. You can keep browsing while you wait.
            </InfoBox>
          </div>
        )}
      </WizardShell>

      <WizardActions
        onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
        onNext={goNext}
        last={step === STEPS.length - 1}
        nextLabel={step === STEPS.length - 1 ? 'Submit for verification' : step === 0 ? 'Next: selfie' : 'Next: review'}
        busy={saving}
        busyLabel="Uploading…"
        hint={showErrors && errorKeys.length ? `${errorKeys.length === 1 ? '1 thing needs' : `${errorKeys.length} things need`} your attention above` : null}
      />
    </>
  )
}
