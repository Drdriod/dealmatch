import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowTopRightOnSquareIcon, BanknotesIcon, BuildingOffice2Icon, BuildingOfficeIcon, BuildingStorefrontIcon,
  CheckCircleIcon, ClockIcon, HomeIcon, HomeModernIcon, KeyIcon, LightBulbIcon, MapIcon, MapPinIcon,
  PencilSquareIcon, ShieldCheckIcon, VideoCameraIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { useFormDraft } from '@/hooks/useFormDraft'
import DraftNotice from '@/components/ui/DraftNotice'
import { WizardShell, WizardActions, StepHeading, Field, ChoiceCard, Chip, InfoBox, inputClass } from '@/components/ui/WizardKit'
import PhotoPicker from '@/components/ui/PhotoPicker'
import PlaceSubtypePicker from '@/components/ui/PlaceSubtypePicker'
import { uploadFile, publicUrlFor } from '@/data/storageRepository'
import { createProperty } from '@/lib/supabase'
import { indexProperty } from '@/lib/pinecone'
import { analytics } from '@/lib/posthog'
import { useAuth } from '@/context/AuthContext'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import { usePlatformFees, escrowRates, formatPlatformFee } from '@/lib/platformFees'

const STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger',
  'Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe',
  'Zamfara','Abuja (FCT)',
]
const FEATURES = [
  'Swimming Pool','Boys Quarters','Gym','Gated Estate','Solar Power',
  'Borehole','CCTV','Parking','Garden','Smart Home','Prepaid Meter','Perforated Fence',
]
const TYPES = [
  { id: 'land',       label: 'Land or plot', icon: MapIcon },
  { id: 'apartment',  label: 'Apartment',    icon: BuildingOffice2Icon },
  { id: 'duplex',     label: 'Duplex',       icon: BuildingOfficeIcon },
  { id: 'detached',   label: 'Detached home', icon: HomeModernIcon },
  { id: 'terrace',    label: 'Terrace',      icon: HomeIcon },
  { id: 'commercial', label: 'Commercial',   icon: BuildingStorefrontIcon },
]
const DOCS = [
  'Certificate of Occupancy (C of O)',
  'Right of Occupancy (R of O)',
  'Deed of Assignment',
  'Registered Survey Plan',
  'Building Approval',
  'Gazette',
]
const LISTING_TYPES = [
  { id: 'For Sale',      label: 'For sale',      hint: 'Sell it outright' },
  { id: 'Joint Venture', label: 'Joint venture', hint: 'Partner with a developer or investor' },
  { id: 'Off-Plan',      label: 'Off-plan',      hint: 'Sell before it is finished building' },
]
const STEPS = ['Property', 'Location and price', 'Details', 'Photos', 'Review']
const MAX_PHOTOS = 12
const MIN_DESCRIPTION = 50

const INITIAL = {
  title:'', property_type:'', listing_type:'For Sale',
  price:'', state:'', city:'', address:'',
  bedrooms:'', bathrooms:'', size_sqm:'',
  description:'', features:[], documents:[],
  images:[], video_url:'',
  category_id:null,
}

// ── Upload a single image file to Supabase Storage ────────
async function uploadImageToSupabase(file, userId) {
  const ext      = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await uploadFile('property-images', fileName, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })

  if (error) throw new Error(`Image upload failed: ${error.message}`)

  return publicUrlFor('property-images', data.path)
}


const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`
const digitsOnly = (v) => String(v).replace(/\D/g, '').slice(0, 12)
// "₦38.5 million" so a long number is easy to check at a glance.
function shortNaira(n) {
  const v = Number(n)
  if (!v) return ''
  if (v >= 1e9) return `₦${+(v / 1e9).toFixed(2)} billion`
  if (v >= 1e6) return `₦${+(v / 1e6).toFixed(2)} million`
  if (v >= 1e3) return `₦${+(v / 1e3).toFixed(1)} thousand`
  return naira(v)
}
const isWebLink = (v) => { try { return /^https?:$/.test(new URL(v).protocol) } catch { return false } }

// What is missing on each step, as { field: message }. Empty means the step is complete.
function validate(step, form, agreed) {
  const e = {}
  if (step === 0) {
    if (!form.property_type) e.property_type = 'Choose what kind of property it is.'
    if (form.title.trim().length < 8) e.title = 'Add a short title of at least 8 characters.'
  }
  if (step === 1) {
    if (!form.state) e.state = 'Choose the state.'
    if (!form.city.trim()) e.city = 'Enter the city or area.'
    if (!(Number(form.price) > 0)) e.price = 'Enter your asking price.'
  }
  if (step === 2) {
    if (!(Number(form.size_sqm) > 0)) e.size_sqm = 'Enter the size in square metres.'
  }
  if (step === 3) {
    if (form.images.length === 0) e.images = 'Add at least one photo.'
    if (form.video_url && !isWebLink(form.video_url)) e.video_url = 'Paste a full link that starts with https://'
  }
  if (step === 4) {
    if (form.description.trim().length < MIN_DESCRIPTION) e.description = `Write at least ${MIN_DESCRIPTION} characters about the property.`
    if (!agreed) e.agreed = 'Please agree to the listing terms to submit.'
  }
  return e
}

export default function ListPropertyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { requireVerification, isVerified, isPending } = useVerificationGuard()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(INITIAL)
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [saved, setSaved] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const firstRender = useRef(true)
  const { fees } = usePlatformFees()
  const saleEscrow = escrowRates(fees, 'sale_escrow')

  // Keeps the answers on this device so a dropped connection or reload never starts it over.
  const draft = useFormDraft('list-property', { step, form, agreed },
    (d) => {
      setStep(Math.min(d.step || 0, STEPS.length - 1))
      // Photos cannot be stored, so only entries that still have an address come back.
      setForm({ ...INITIAL, ...(d.form || {}), images: (d.form?.images || []).filter((i) => i && i.url) })
      setAgreed(!!d.agreed)
    },
    { userId: user?.id, enabled: !!user?.id })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const text = (k) => (e) => set(k, e.target.value)
  const toggle = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }))
  const isLand = form.property_type === 'land'
  const errors = validate(step, form, agreed)
  const errorKeys = Object.keys(errors)
  const shown = showErrors ? errors : {}

  // New step: back to the top, and screen readers land on its heading.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.getElementById('wizard-step-title')?.focus({ preventScroll: true })
    setShowErrors(false)
  }, [step])

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

  // Upload the photos first, then save the listing. A photo that fails stops the submit, so a
  // listing never goes out with fewer photos than the seller chose.
  const handleSubmit = async () => {
    if (!user?.id) { toast.error('Sign in to list a property.'); return }
    // Verification is only needed to submit, so everything above could be filled in freely.
    if (!(await requireVerification('sell'))) return

    setSaving(true)
    try {
      const uploaded = []
      for (let i = 0; i < form.images.length; i += 1) {
        const img = form.images[i]
        setProgress(`Uploading photo ${i + 1} of ${form.images.length}…`)
        if (img.url.startsWith('blob:') && img.file) {
          if (img.remoteUrl) { uploaded.push({ url: img.remoteUrl, is_primary: img.is_primary }); continue }
          let remoteUrl
          try {
            remoteUrl = await uploadImageToSupabase(img.file, user.id)
          } catch (uploadErr) {
            console.error('Image upload error:', uploadErr)
            toast.error(`Photo ${i + 1} did not upload. Check your connection and press Submit again.`)
            setSaving(false); setProgress('')
            return
          }
          uploaded.push({ url: remoteUrl, is_primary: img.is_primary })
          // Remember it, so a retry does not upload the same photo twice.
          setForm((f) => ({ ...f, images: f.images.map((x, j) => (j === i ? { ...x, remoteUrl } : x)) }))
        } else {
          uploaded.push({ url: img.url, is_primary: img.is_primary })
        }
      }

      setProgress('Submitting your listing…')
      const { data, error } = await createProperty({
        title:         form.title.trim(),
        property_type: form.property_type,
        listing_type:  form.listing_type,
        price:         Number(form.price),
        state:         form.state,
        city:          form.city.trim(),
        address:       form.address.trim() || null,
        bedrooms:      form.bedrooms  ? Number(form.bedrooms)  : null,
        bathrooms:     form.bathrooms ? Number(form.bathrooms) : null,
        size_sqm:      Number(form.size_sqm),
        description:   form.description.trim(),
        features:      form.features,
        documents:     form.documents,
        video_url:     form.video_url.trim() || null,
        seller_id:     user.id,
        status:        'pending_review',  // an agent verifies it on site before it goes live
        category:      'sale',
        category_id:   form.category_id || null,
        images:        uploaded,
      })
      if (error) {
        console.error('createProperty error:', error)
        toast.error(`We couldn't submit your listing: ${error.message || 'please try again'}`)
        setSaving(false); setProgress('')
        return
      }

      try {
        setProgress('Finishing up…')
        await indexProperty(data)
        analytics.propertyListed(data.id, data.property_type)
      } catch (indexErr) {
        console.warn('Pinecone index failed (non-blocking):', indexErr)
      }

      draft.clear()
      setSaved(true)
    } catch (err) {
      console.error('Unexpected error during submit:', err)
      toast.error(`Something went wrong. ${err.message || 'Please try again.'}`)
      setSaving(false); setProgress('')
    }
  }

  if (saved) return <SubmittedScreen onAnother={() => { setForm(INITIAL); setAgreed(false); setStep(0); setSaved(false); setSaving(false) }} />

  const startOver = () => { setStep(0); setForm(INITIAL); setAgreed(false) }

  const verifyNotice = !isVerified() && !isPending() ? (
    <div className="mb-5 flex items-start gap-3 rounded-[24px_24px_24px_8px] border border-sun/50 bg-sun/15 p-4 text-sm">
      <ShieldCheckIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-forest" aria-hidden="true" />
      <p>
        <span className="font-bold">Fill this in now, verify when you submit.</span>{' '}
        We ask you to confirm your identity before the listing goes for review.{' '}
        <Link to="/verify-identity" state={{ returnTo: '/list' }} className="font-bold text-terracotta-dark underline underline-offset-2">Verify now</Link>
        . Your answers stay saved.
      </p>
    </div>
  ) : null

  return (
    <>
      <WizardShell
        eyebrow="List for sale"
        title="List a property"
        subtitle="Five short steps. It takes about five minutes, and your answers are saved as you go."
        steps={STEPS}
        step={step}
        onStepClick={(i) => setStep(i)}
        notice={<>{verifyNotice}<DraftNotice draft={draft} onStartOver={startOver} /></>}
      >
        {step === 0 && (
          <div className="space-y-6">
            <StepHeading title="What are you listing?">Pick the type first. We will ask for the rest next.</StepHeading>

            <div role="group" aria-label="What would you like to do?" className="grid grid-cols-2 gap-1 rounded-full border border-line bg-cream p-1">
              <span className="flex items-center justify-center gap-2 rounded-full bg-forest py-2.5 text-sm font-bold text-white" aria-current="true">
                <BanknotesIcon className="h-4 w-4" aria-hidden="true" /> Sell it
              </span>
              <button type="button" onClick={() => navigate('/list-rental')}
                className="flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-deep hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
                <KeyIcon className="h-4 w-4" aria-hidden="true" /> Rent it out
              </button>
            </div>

            <Field id="f-property_type" label="Property type" error={shown.property_type}>
              <div role="radiogroup" aria-label="Property type" className="grid grid-cols-2 gap-2.5">
                {TYPES.map((t) => (
                  <ChoiceCard key={t.id} icon={t.icon} label={t.label} selected={form.property_type === t.id}
                    onClick={() => setForm((f) => ({ ...f, property_type: t.id, category_id: null }))} />
                ))}
              </div>
            </Field>

            <PlaceSubtypePicker category="sale" propertyType={form.property_type}
              value={form.category_id} onChange={(id) => set('category_id', id)} />

            <Field id="f-listing_type" label="How are you selling it?">
              <div role="radiogroup" aria-label="How are you selling it?" className="grid gap-2.5 sm:grid-cols-3">
                {LISTING_TYPES.map((lt) => (
                  <ChoiceCard key={lt.id} label={lt.label} description={lt.hint} selected={form.listing_type === lt.id}
                    onClick={() => set('listing_type', lt.id)} />
                ))}
              </div>
            </Field>

            <Field id="f-title" label="Listing title" error={shown.title} hint="Say what it is and where, like a headline.">
              <input className={`input ${inputClass}`} type="text" maxLength={90} autoComplete="off"
                placeholder="e.g. 700 sqm plot with bungalow, Uyo" value={form.title} onChange={text('title')} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <StepHeading title="Where is it, and what is your price?">Buyers search by area and budget first.</StepHeading>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="f-state" label="State" error={shown.state}>
                <select className={`select ${inputClass}`} value={form.state} onChange={text('state')}>
                  <option value="">Choose a state</option>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field id="f-city" label="City or area" error={shown.city}>
                <input className={`input ${inputClass}`} type="text" autoComplete="off" placeholder="e.g. Lekki Phase 1"
                  value={form.city} onChange={text('city')} />
              </Field>
            </div>

            <Field id="f-address" label="Street address" optional hint="Only people you approve see this. Skip it if you prefer.">
              <input className={`input ${inputClass}`} type="text" autoComplete="off" placeholder="House number and street"
                value={form.address} onChange={text('address')} />
            </Field>

            <Field id="f-price" label="Asking price" error={shown.price} hint={shortNaira(form.price) ? `About ${shortNaira(form.price)}` : 'In naira, numbers only.'}>
              <input className={`input ${inputClass}`} type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 38,500,000"
                value={form.price ? Number(form.price).toLocaleString('en-NG') : ''}
                onChange={(e) => set('price', digitsOnly(e.target.value))} />
            </Field>

            {Number(form.price) > 0 && (
              <InfoBox icon={BanknotesIcon} title="What you would receive">
                {!saleEscrow ? <p>Loading the current fee…</p> : (() => {
                  const gross = Number(form.price)
                  const feeEach = Math.round(gross * saleEscrow.perSide / 100)
                  return (
                    <dl className="mt-1 space-y-1">
                      <div className="flex justify-between gap-3"><dt>Asking price</dt><dd className="font-semibold">{naira(gross)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>DealMatch fee ({formatPlatformFee({ kind: 'percent', value: saleEscrow.perSide })} per side)</dt><dd className="font-semibold text-terracotta-dark">-{naira(feeEach)}</dd></div>
                      <div className="flex justify-between gap-3 border-t border-forest/15 pt-1.5 text-sm"><dt className="font-bold">You receive</dt><dd className="font-bold text-forest">{naira(gross - feeEach)}</dd></div>
                    </dl>
                  )
                })()}
              </InfoBox>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <StepHeading title="Size and what comes with it">The more you share, the fewer questions buyers send.</StepHeading>

            <div className={`grid gap-3 ${isLand ? '' : 'grid-cols-3'}`}>
              {!isLand && (
                <>
                  <Field id="f-bedrooms" label="Beds">
                    <input className={`input ${inputClass}`} type="text" inputMode="numeric" placeholder="0"
                      value={form.bedrooms} onChange={(e) => set('bedrooms', digitsOnly(e.target.value).slice(0, 2))} />
                  </Field>
                  <Field id="f-bathrooms" label="Baths">
                    <input className={`input ${inputClass}`} type="text" inputMode="numeric" placeholder="0"
                      value={form.bathrooms} onChange={(e) => set('bathrooms', digitsOnly(e.target.value).slice(0, 2))} />
                  </Field>
                </>
              )}
              <Field id="f-size_sqm" label="Size (sqm)" error={shown.size_sqm}>
                <input className={`input ${inputClass}`} type="text" inputMode="numeric" placeholder="e.g. 400"
                  value={form.size_sqm} onChange={(e) => set('size_sqm', digitsOnly(e.target.value).slice(0, 7))} />
              </Field>
            </div>

            <div>
              <p className="mb-2 text-sm font-bold">Features and amenities <span className="text-xs font-medium text-warm">Optional</span></p>
              <div className="flex flex-wrap gap-2">
                {FEATURES.map((f) => <Chip key={f} selected={form.features.includes(f)} onClick={() => toggle('features', f)}>{f}</Chip>)}
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-bold">Documents you can show buyers <span className="text-xs font-medium text-warm">Optional</span></p>
              <p className="mb-2 text-xs text-warm">Tick only what you hold. Our agent checks these on the visit.</p>
              <div className="flex flex-wrap gap-2">
                {DOCS.map((d) => <Chip key={d} selected={form.documents.includes(d)} onClick={() => toggle('documents', d)}>{d}</Chip>)}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <StepHeading title="Show it off">Clear photos earn the most interest. Add at least one.</StepHeading>

            <Field id="f-images" label={`Photos (${form.images.length} of ${MAX_PHOTOS})`} error={shown.images}
              hint="JPG, PNG or WebP, up to 10 MB each. Front, rooms, compound and surroundings.">
              <PhotoPicker images={form.images} invalid={!!shown.images} max={MAX_PHOTOS}
                onChange={(next) => setForm((f) => ({ ...f, images: typeof next === 'function' ? next(f.images) : next }))} />
            </Field>

            <Field id="f-video_url" label="Video tour link" optional error={shown.video_url}
              hint="Paste a YouTube, Loom or similar link. Upload the video there first, then paste the link here.">
              <div className="relative">
                <VideoCameraIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-warm" aria-hidden="true" />
                <input className={`input ${inputClass} !pl-12`} type="url" inputMode="url" autoComplete="off" placeholder="https://youtube.com/watch?v=…"
                  value={form.video_url} onChange={text('video_url')} />
              </div>
            </Field>

            <InfoBox icon={LightBulbIcon} title="Tip" tone="sun">
              Take photos in daylight with your phone held sideways. A short walk-through video tells buyers more than photos can.
            </InfoBox>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <StepHeading title="Describe it, then check everything">This is the last step. You can still edit any section.</StepHeading>

            <Field id="f-description" label="Description" error={shown.description}
              hint={`${form.description.trim().length} characters. Mention landmarks, road access and the title status.`}>
              <textarea className={`input ${inputClass} resize-none`} rows={6} placeholder="Where it is, what it has, how to get there, and the title status."
                value={form.description} onChange={text('description')} />
            </Field>

            <dl className="divide-y divide-line rounded-2xl border border-line bg-cream/60">
              {[
                { to: 0, label: 'Property', value: `${TYPES.find((t) => t.id === form.property_type)?.label || ''} · ${LISTING_TYPES.find((l) => l.id === form.listing_type)?.label}`, sub: form.title },
                { to: 1, label: 'Location and price', value: `${form.city}, ${form.state}`, sub: naira(form.price) },
                { to: 2, label: 'Details', value: `${form.size_sqm} sqm${isLand ? '' : ` · ${form.bedrooms || 0} bed · ${form.bathrooms || 0} bath`}`, sub: `${form.features.length} features · ${form.documents.length} documents` },
                { to: 3, label: 'Photos', value: `${form.images.length} photo${form.images.length === 1 ? '' : 's'}`, sub: form.video_url ? 'Video link added' : 'No video link' },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    <dt className="text-xs font-bold uppercase tracking-wider text-warm">{row.label}</dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold">{row.value}</dd>
                    <dd className="truncate text-xs text-warm">{row.sub}</dd>
                  </div>
                  <button type="button" onClick={() => setStep(row.to)}
                    className="flex flex-shrink-0 items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold hover:border-deep/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
                    <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                  </button>
                </div>
              ))}
            </dl>

            <InfoBox icon={ClockIcon} title="What happens after you submit">
              Our team reviews it and visits the property before it appears to buyers. You can follow its status on your dashboard.
            </InfoBox>

            <Field id="f-agreed" label="Listing terms" error={shown.agreed}>
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors ${agreed ? 'border-terracotta bg-orange-pale' : shown.agreed ? 'border-terracotta bg-white' : 'border-line bg-white'}`}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-terracotta" />
                <span className="text-xs leading-relaxed text-warm">
                  <span className="block text-sm font-bold text-deep">I agree to the DealMatch listing terms</span>
                  I confirm this property is mine or I have authority to list it. I agree to the{' '}
                  <Link to="/terms" target="_blank" className="font-semibold text-terracotta-dark underline">Terms of Service<ArrowTopRightOnSquareIcon className="ml-0.5 inline h-3 w-3" aria-hidden="true" /></Link> and{' '}
                  <Link to="/privacy" target="_blank" className="font-semibold text-terracotta-dark underline">Privacy Policy<ArrowTopRightOnSquareIcon className="ml-0.5 inline h-3 w-3" aria-hidden="true" /></Link>.
                </span>
              </label>
            </Field>
          </div>
        )}
      </WizardShell>

      <WizardActions
        onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
        onNext={goNext}
        last={step === STEPS.length - 1}
        nextLabel={step === STEPS.length - 1 ? 'Submit for review' : 'Continue'}
        busy={saving}
        busyLabel={progress || 'Submitting…'}
        hint={showErrors && errorKeys.length ? `${errorKeys.length === 1 ? '1 thing needs' : `${errorKeys.length} things need`} your attention above` : null}
      />
    </>
  )
}

function SubmittedScreen({ onAnother }) {
  const navigate = useNavigate()
  const next = [
    { icon: CheckCircleSolid, title: 'Submitted', text: 'We have your listing.', done: true },
    { icon: ShieldCheckIcon, title: 'Checked on site', text: 'Our team visits the property and checks the details.' },
    { icon: MapPinIcon, title: 'Goes live', text: 'Once verified, buyers can find it and get in touch.' },
  ]
  return (
    <div className="min-h-screen bg-cream px-4 pb-10 pt-28 text-deep">
      <div className="mx-auto max-w-md text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest text-white shadow-glow">
          <CheckCircleIcon className="h-9 w-9" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-3xl">Your listing is submitted</h1>
        <p className="mt-2 text-sm text-warm">It will not show to buyers until our team has verified it on site.</p>

        <ol className="mt-7 space-y-3 rounded-[32px_32px_32px_10px] border border-line bg-white p-5 text-left shadow-card">
          {next.map((n) => (
            <li key={n.title} className="flex gap-3">
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${n.done ? 'bg-forest text-white' : 'bg-forest-pale text-forest'}`}>
                <n.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span><span className="block text-sm font-bold">{n.title}</span><span className="block text-xs text-warm">{n.text}</span></span>
            </li>
          ))}
        </ol>

        <div className="mt-6 space-y-3">
          <button type="button" onClick={() => navigate('/manage-listings')} className="btn-primary w-full !py-3.5">See my listings</button>
          <button type="button" onClick={onAnother} className="btn-secondary w-full !py-3.5">List another property</button>
          <button type="button" onClick={() => navigate('/dashboard')} className="btn-ghost w-full">Go to dashboard</button>
        </div>
      </div>
    </div>
  )
}
