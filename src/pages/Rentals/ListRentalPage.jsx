import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowTopRightOnSquareIcon, BanknotesIcon, BuildingOffice2Icon, BuildingStorefrontIcon, CheckCircleIcon,
  ClockIcon, HomeModernIcon, LightBulbIcon, MapPinIcon, PencilSquareIcon, ShieldCheckIcon, VideoCameraIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { uploadFile, publicUrlFor } from '@/data/storageRepository'
import { stripControlChars } from '@/lib/supabase'
import { insertListedProperty } from '@/data/rentalsRepository'
import { useAuth } from '@/context/AuthContext'
import { useFormDraft } from '@/hooks/useFormDraft'
import DraftNotice from '@/components/ui/DraftNotice'
import VerifyReminder from '@/components/ui/VerifyReminder'
import PhotoPicker from '@/components/ui/PhotoPicker'
import PlaceSubtypePicker from '@/components/ui/PlaceSubtypePicker'
import { WizardShell, WizardActions, StepHeading, Field, ChoiceCard, Chip, InfoBox, inputClass } from '@/components/ui/WizardKit'

const STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','Abuja (FCT)']
const HOTEL_FEATURES  = ['Pool','Restaurant','Bar','Gym','Spa','Wifi','Generator','AC','Room Service','Conference Hall','Parking','Security','CCTV','Laundry','24hr Reception']
const RENTAL_FEATURES = ['Furnished','Wifi','Generator','AC','Security','Parking','Borehole','Prepaid Meter','Pop Ceiling','Tiled Floor','Kitchen','Store','CCTV','Balcony']
async function uploadToStorage(file, userId, folder) {
  const ext  = file.name.split('.').pop()
  const path = `${userId}/${folder}_${Date.now()}.${ext}`
  const { data, error } = await uploadFile('property-images', path, file, { upsert:false, contentType:file.type })
  if (error) throw error
  return publicUrlFor('property-images', data.path)
}

const STEPS = ['Basics', 'Price and details', 'Photos', 'Review']
const MAX_PHOTOS = 10
const MIN_DESCRIPTION = 30

const blankForm = (category) => ({
  title:'', state:'', city:'', address:'',
  price:'', description:'', features:[], images:[], video_url:'',
  bedrooms:'', bathrooms:'', size_sqm:'', max_guests:'',
  category, category_id: null,
})

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`
const digitsOnly = (v) => String(v).replace(/\D/g, '').slice(0, 12)
function shortNaira(n) {
  const v = Number(n)
  if (!v) return ''
  if (v >= 1e9) return `₦${+(v / 1e9).toFixed(2)} billion`
  if (v >= 1e6) return `₦${+(v / 1e6).toFixed(2)} million`
  if (v >= 1e3) return `₦${+(v / 1e3).toFixed(1)} thousand`
  return naira(v)
}
const isWebLink = (v) => { try { return /^https?:$/.test(new URL(v).protocol) } catch { return false } }

function validate(step, form, agreed) {
  const e = {}
  if (step === 0) {
    if (form.title.trim().length < 6) e.title = 'Add a short title of at least 6 characters.'
    if (!form.state) e.state = 'Choose the state.'
    if (!form.city.trim()) e.city = 'Enter the city or area.'
  }
  if (step === 1) {
    if (!(Number(form.price) > 0)) e.price = 'Enter the price.'
    if (!(Number(form.size_sqm) > 0)) e.size_sqm = 'Enter the size in square metres.'
  }
  if (step === 2) {
    if (form.images.length === 0) e.images = 'Add at least one photo.'
    if (form.video_url && !isWebLink(form.video_url)) e.video_url = 'Paste a full link that starts with https://'
  }
  if (step === 3) {
    if (form.description.trim().length < MIN_DESCRIPTION) e.description = `Write at least ${MIN_DESCRIPTION} characters about the place.`
    if (!agreed) e.agreed = 'Please agree to the listing terms to submit.'
  }
  return e
}

export default function ListRentalPage() {
  const [params] = useSearchParams()
  const type = params.get('type') || 'rental'
  const isHotel = type === 'hotel' || type === 'shortlet'
  const noun = isHotel ? 'hotel or short-let' : 'rental'
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [listingId, setListingId] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [progress, setProgress] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [form, setForm] = useState(() => blankForm(type))
  const firstRender = useRef(true)

  // Keeps the answers on this device so a dropped connection or reload never starts it over.
  const draft = useFormDraft(`list-${type}`, { step, form, agreed },
    (d) => {
      setStep(Math.min(d.step || 0, STEPS.length - 1))
      setForm({ ...blankForm(type), ...(d.form || {}), images: (d.form?.images || []).filter((i) => i && i.url) })
      setAgreed(!!d.agreed)
    },
    { userId: user?.id, enabled: !!user?.id })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const text = (k) => (e) => set(k, e.target.value)
  const toggle = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }))
  const errors = validate(step, form, agreed)
  const errorKeys = Object.keys(errors)
  const shown = showErrors ? errors : {}

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

  // Photos upload first. A photo that fails stops the submit, and a retry does not upload the
  // photos that already went through.
  const handleSubmit = async () => {
    if (saving) return
    if (!user?.id) { toast.error('Sign in to list a property.'); return }
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
            remoteUrl = await uploadToStorage(img.file, user.id, 'photo')
          } catch {
            toast.error(`Photo ${i + 1} did not upload. Check your connection and press Submit again.`)
            setSaving(false); setProgress('')
            return
          }
          uploaded.push({ url: remoteUrl, is_primary: img.is_primary })
          setForm((f) => ({ ...f, images: f.images.map((x, j) => (j === i ? { ...x, remoteUrl } : x)) }))
        } else {
          uploaded.push({ url: img.url, is_primary: img.is_primary })
        }
      }

      setProgress('Submitting your listing…')
      // stripControlChars removes stray control characters (pasted text can carry them), which
      // the database rejects as "null character not permitted".
      const { data: created, error } = await insertListedProperty(stripControlChars({
        title:         form.title.trim(),
        property_type: isHotel ? form.category : 'apartment',
        listing_type:  isHotel ? (form.category === 'hotel' ? 'Hotel' : 'Short-let') : 'Rental',
        price:         Number(form.price) || 0,
        state:         form.state,
        city:          form.city.trim(),
        address:       form.address.trim() || null,
        bedrooms:      form.bedrooms  ? Number(form.bedrooms)  : null,
        bathrooms:     form.bathrooms ? Number(form.bathrooms) : null,
        size_sqm:      Number(form.size_sqm) || 0,
        max_guests:    form.max_guests ? Number(form.max_guests) : null,
        description:   form.description.trim(),
        features:      form.features,
        images:        uploaded,
        video_url:     form.video_url.trim() || null,
        seller_id:     user.id,
        status:        'pending_review',  // an agent verifies it before it goes live
        category:      form.category,
        category_id:   form.category_id || null,
      }))
      if (error || !created?.id) throw error || new Error('Listing was not confirmed by the server')
      setListingId(created.id)
      draft.clear()
      setSaved(true)
    } catch (err) {
      console.error('[listing-submit]', err?.message || err)
      toast.error("We couldn't save your listing. Check your details and try again. If it keeps happening, contact support.")
    } finally {
      setSaving(false)
      setProgress('')
    }
  }

  const again = () => { setSaved(false); setListingId(null); setStep(0); setForm(blankForm(type)); setAgreed(false) }

  if (saved) return <SubmittedScreen noun={noun} listingId={listingId} onAnother={again} />

  const priceLabel = isHotel ? 'Starting price per night' : 'Annual rent'

  return (
    <>
      <WizardShell
        eyebrow={isHotel ? 'List a hotel or short-let' : 'List for rent'}
        title={isHotel ? 'List your hotel or short-let' : 'List your rental'}
        subtitle="Four short steps. A DealMatch agent verifies the place before it appears to renters, and your answers are saved as you go."
        steps={STEPS}
        step={step}
        onStepClick={(i) => setStep(i)}
        notice={<DraftNotice draft={draft} onStartOver={() => { setStep(0); setForm(blankForm(type)); setAgreed(false) }} />}
      >
        {step === 0 && (
          <div className="space-y-6">
            <StepHeading title="Tell us about the place">Start with its name and where it is.</StepHeading>

            {isHotel && (
              <Field id="f-category" label="Type">
                <div role="radiogroup" aria-label="Type" className="grid grid-cols-2 gap-2.5">
                  <ChoiceCard icon={BuildingStorefrontIcon} label="Hotel" selected={form.category === 'hotel'}
                    onClick={() => setForm((f) => ({ ...f, category: 'hotel', category_id: null }))} />
                  <ChoiceCard icon={HomeModernIcon} label="Short-let" selected={form.category === 'shortlet'}
                    onClick={() => setForm((f) => ({ ...f, category: 'shortlet', category_id: null }))} />
                </div>
              </Field>
            )}

            <PlaceSubtypePicker category={form.category} propertyType="apartment"
              value={form.category_id} onChange={(id) => set('category_id', id)} />

            <Field id="f-title" label={isHotel ? 'Property name' : 'Listing title'} error={shown.title}
              hint={isHotel ? 'The name guests will recognise.' : 'Say what it is and where, like a headline.'}>
              <input className={`input ${inputClass}`} type="text" maxLength={90} autoComplete="off"
                placeholder={isHotel ? 'e.g. The Grand Lagos Hotel' : 'e.g. 3-bed apartment, Lekki'} value={form.title} onChange={text('title')} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="f-state" label="State" error={shown.state}>
                <select className={`select ${inputClass}`} value={form.state} onChange={text('state')}>
                  <option value="">Choose a state</option>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field id="f-city" label="City or area" error={shown.city}>
                <input className={`input ${inputClass}`} type="text" autoComplete="off" placeholder="e.g. Lekki"
                  value={form.city} onChange={text('city')} />
              </Field>
            </div>

            <Field id="f-address" label="Street address" optional hint="Our agent uses this to find the place. Only people you approve see it.">
              <input className={`input ${inputClass}`} type="text" autoComplete="off" placeholder="House number and street"
                value={form.address} onChange={text('address')} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <StepHeading title="Price and details">The basics renters compare first.</StepHeading>

            <Field id="f-price" label={priceLabel} error={shown.price}
              hint={shortNaira(form.price) ? `About ${shortNaira(form.price)}${isHotel ? ' per night' : ' a year'}` : 'In naira, numbers only.'}>
              <input className={`input ${inputClass}`} type="text" inputMode="numeric" autoComplete="off" placeholder={isHotel ? 'e.g. 35,000' : 'e.g. 1,800,000'}
                value={form.price ? Number(form.price).toLocaleString('en-NG') : ''}
                onChange={(e) => set('price', digitsOnly(e.target.value))} />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              {isHotel ? (
                <Field id="f-max_guests" label="Max guests" optional={false}>
                  <input className={`input ${inputClass}`} type="text" inputMode="numeric" placeholder="e.g. 4"
                    value={form.max_guests} onChange={(e) => set('max_guests', digitsOnly(e.target.value).slice(0, 3))} />
                </Field>
              ) : (
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
                <input className={`input ${inputClass}`} type="text" inputMode="numeric" placeholder="e.g. 120"
                  value={form.size_sqm} onChange={(e) => set('size_sqm', digitsOnly(e.target.value).slice(0, 6))} />
              </Field>
            </div>

            <div>
              <p className="mb-2 text-sm font-bold">Features and amenities <span className="text-xs font-medium text-warm">Optional</span></p>
              <div className="flex flex-wrap gap-2">
                {(isHotel ? HOTEL_FEATURES : RENTAL_FEATURES).map((f) => (
                  <Chip key={f} selected={form.features.includes(f)} onClick={() => toggle('features', f)}>{f}</Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <StepHeading title="Show it off">Clear photos earn the most interest. Add at least one.</StepHeading>

            <Field id="f-images" label={`Photos (${form.images.length} of ${MAX_PHOTOS})`} error={shown.images}
              hint="JPG, PNG or WebP, up to 10 MB each. Rooms, view and outside.">
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
              Take photos in daylight with your phone held sideways, and show the bed, the bathroom and the view.
            </InfoBox>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <StepHeading title="Describe it, then check everything">This is the last step. You can still edit any section.</StepHeading>

            <Field id="f-description" label="Description" error={shown.description}
              hint={`${form.description.trim().length} characters. Say how to get there, nearby landmarks and what makes it special.`}>
              <textarea className={`input ${inputClass} resize-none`} rows={5}
                placeholder={`Describe the ${noun}.`} value={form.description} onChange={text('description')} />
            </Field>

            <dl className="divide-y divide-line rounded-2xl border border-line bg-cream/60">
              {[
                { to: 0, label: 'Place', value: form.title, sub: `${form.city}, ${form.state}` },
                { to: 1, label: priceLabel, value: naira(form.price), sub: `${form.size_sqm} sqm${isHotel ? (form.max_guests ? ` · ${form.max_guests} guests` : '') : ` · ${form.bedrooms || 0} bed · ${form.bathrooms || 0} bath`} · ${form.features.length} features` },
                { to: 2, label: 'Photos', value: `${form.images.length} photo${form.images.length === 1 ? '' : 's'}`, sub: form.video_url ? 'Video link added' : 'No video link' },
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
              A DealMatch agent verifies the place before it appears to renters. You can follow its status on your dashboard.
            </InfoBox>

            <Field id="f-agreed" label="Listing terms" error={shown.agreed}>
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors ${agreed ? 'border-terracotta bg-orange-pale' : shown.agreed ? 'border-terracotta bg-white' : 'border-line bg-white'}`}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-terracotta" />
                <span className="text-xs leading-relaxed text-warm">
                  <span className="block text-sm font-bold text-deep">I agree to the DealMatch listing terms</span>
                  I confirm this place is mine or I have authority to list it. I agree to the{' '}
                  <Link to="/terms" target="_blank" className="font-semibold text-terracotta-dark underline">Terms of Service<ArrowTopRightOnSquareIcon className="ml-0.5 inline h-3 w-3" aria-hidden="true" /></Link>.
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
        nextLabel={step === STEPS.length - 1 ? 'Submit for verification' : 'Continue'}
        busy={saving}
        busyLabel={progress || 'Submitting…'}
        hint={showErrors && errorKeys.length ? `${errorKeys.length === 1 ? '1 thing needs' : `${errorKeys.length} things need`} your attention above` : null}
      />
    </>
  )
}

function SubmittedScreen({ noun, listingId, onAnother }) {
  const navigate = useNavigate()
  const next = [
    { icon: CheckCircleIcon, title: 'Submitted', text: 'We have your listing.', done: true },
    { icon: ShieldCheckIcon, title: 'Verified by an agent', text: 'A DealMatch agent checks the place.' },
    { icon: MapPinIcon, title: 'Goes live', text: 'Once verified, renters can find it.' },
  ]
  return (
    <div className="min-h-screen bg-cream px-4 pb-10 pt-12 text-deep">
      <div className="mx-auto max-w-md text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest text-white shadow-glow">
          <CheckCircleIcon className="h-9 w-9" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-3xl">Your listing is submitted</h1>
        <p className="mt-2 text-sm text-warm">Your {noun} will not show to renters until an agent has verified it.</p>
        {listingId ? <p className="mt-2 text-xs font-semibold text-warm">Reference: {listingId}</p> : null}

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

        <VerifyReminder returnTo="/landlord" className="mt-5" />

        <div className="mt-6 space-y-3">
          <button type="button" onClick={() => navigate('/landlord')} className="btn-primary w-full !py-3.5">Go to dashboard</button>
          <button type="button" onClick={onAnother} className="btn-secondary w-full !py-3.5">List another property</button>
        </div>
      </div>
    </div>
  )
}
