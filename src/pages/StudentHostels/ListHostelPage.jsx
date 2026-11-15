/**
 * ListHostelPage - /list-hostel
 * ══════════════════════════════
 * Hostel owners list their rooms here.
 * Payment required before listing goes live. Plan prices come from the
 * platform fee registry (hostel_listing_semester, hostel_listing_annual).
 *
 * Security: listing_paid = false until Flutterwave confirms payment.
 * The listing is created in DB immediately but stays in 'pending_review'
 * until payment is confirmed AND an admin/verifier approves it.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BanknotesIcon, BuildingOffice2Icon, BuildingOfficeIcon, CheckCircleIcon, ClockIcon,
  CreditCardIcon, HomeIcon, InformationCircleIcon, LockClosedIcon, PencilSquareIcon, ShieldCheckIcon, UserGroupIcon, UserIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { uploadFile, publicUrlFor } from '@/data/storageRepository'
import { updateHostel, insertHostel } from '@/data/hostelListingRepository'
import { useAuth } from '@/context/AuthContext'
import { useFormDraft } from '@/hooks/useFormDraft'
import { initializeFlutterwavePayment, generateReference, getFeeAmounts } from '@/lib/flutterwave'
import { usePlatformFees } from '@/lib/platformFees'
import DraftNotice from '@/components/ui/DraftNotice'
import PhotoPicker from '@/components/ui/PhotoPicker'
import { WizardShell, WizardActions, StepHeading, Field, ChoiceCard, Chip, InfoBox, inputClass } from '@/components/ui/WizardKit'

const ROOM_TYPES = [
  { id: 'single',       label: 'Single room',   desc: '1 person per room',           icon: UserIcon },
  { id: 'shared_2',     label: 'Shared (2)',    desc: '2 people sharing',            icon: UserGroupIcon },
  { id: 'shared_4',     label: 'Shared (4)',    desc: '4 people sharing',            icon: UserGroupIcon },
  { id: 'shared_6',     label: 'Shared (6)',    desc: '6 people sharing',            icon: UserGroupIcon },
  { id: 'self_contain', label: 'Self contain',  desc: 'Private bathroom and kitchen', icon: HomeIcon },
  { id: 'mini_flat',    label: 'Mini flat',     desc: 'Sitting room and bedroom',    icon: BuildingOfficeIcon },
  { id: '2_bedroom',    label: '2 bedroom',     desc: 'Full 2-bedroom apartment',    icon: BuildingOffice2Icon },
]

// The ids are what the listing stores, so they must not change.
const AMENITIES = [
  { id: 'wifi', label: 'WiFi' }, { id: 'gen', label: 'Generator' }, { id: 'water', label: 'Running water' },
  { id: 'security', label: 'Security' }, { id: 'fence', label: 'Fenced' }, { id: 'cctv', label: 'CCTV' },
  { id: 'parking', label: 'Parking' }, { id: 'kitchen', label: 'Kitchen' }, { id: 'study', label: 'Study room' },
  { id: 'laundry', label: 'Laundry' },
]

const GENDER_OPTIONS = [
  { id: 'mixed',       label: 'Mixed',        desc: 'Male and female' },
  { id: 'male_only',   label: 'Male only',    desc: 'Male students' },
  { id: 'female_only', label: 'Female only',  desc: 'Female students' },
]

const INITIAL_FORM = {
  title: '', description: '', address: '', city: '', state: '',
  institution_id: '', institution_name: '', distance_km: '',
  distance_label: '',
  room_type: '', gender_policy: 'mixed',
  rooms_available: '1', total_rooms: '1',
  price_per_year: '', caution_fee: '', agency_fee: '',
  amenities: [], images: [],
}

const STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger',
  'Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe',
  'Zamfara','Abuja (FCT)',
]

const STEPS = ['Rooms', 'Rent and fees', 'Location', 'Amenities and photos', 'Plan and payment']
const SAVE_AT = 3          // leaving this step saves the listing, ready for payment
const MAX_PHOTOS = 8

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`
const digitsOnly = (v, max = 9) => String(v).replace(/\D/g, '').slice(0, max)
const money = (k, set) => ({
  type: 'text', inputMode: 'numeric', autoComplete: 'off',
  onChange: (e) => set(k, digitsOnly(e.target.value, 10)),
})

// A naira amount box: shows 120,000 while the value stays plain digits. Field passes its id and
// aria attributes to this component, which hands them to the input.
function NairaInput({ value, onChange, className = '', ...rest }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-warm">₦</span>
      <input type="text" inputMode="numeric" autoComplete="off" className={`input ${inputClass} !pl-9 ${className}`}
        value={value ? Number(value).toLocaleString('en-NG') : ''}
        onChange={(e) => onChange(digitsOnly(e.target.value, 10))} {...rest} />
    </div>
  )
}

function validate(step, form) {
  const e = {}
  if (step === 0) {
    if (form.title.trim().length < 4) e.title = 'Add the hostel name (at least 4 characters).'
    if (!form.room_type) e.room_type = 'Choose the room type.'
    const avail = Number(form.rooms_available)
    const total = Number(form.total_rooms)
    if (!(avail >= 1)) e.rooms_available = 'Enter at least 1 room.'
    else if (total && avail > total) e.rooms_available = 'This cannot be more than the total rooms.'
  }
  if (step === 1) {
    if (!(Number(form.price_per_year) > 0)) e.price_per_year = 'Enter the annual rent.'
  }
  if (step === 2) {
    if (!form.address.trim()) e.address = 'Enter the street address.'
    if (!form.city.trim()) e.city = 'Enter the city.'
    if (!form.state) e.state = 'Choose the state.'
    if (!form.institution_name.trim()) e.institution_name = 'Enter the nearest school.'
  }
  if (step === 3) {
    if (form.images.length === 0) e.images = 'Add at least one photo.'
  }
  return e
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ListHostelPage() {
  const { user } = useAuth()

  const [step,       setStep]    = useState(0)
  const [form,       setForm]    = useState(INITIAL_FORM)
  const [plan,       setPlan]    = useState('semester')
  const [saving,     setSaving]  = useState(false)
  const [hostelId,   setHostelId] = useState(null)
  const [paymentDone, setPaymentDone] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const firstRender = useRef(true)

  // Keeps the answers on this device so a dropped connection or reload never starts it over.
  // Photos are uploaded as they are added, so they come back too.
  const draft = useFormDraft('list-hostel', { step, form, plan, hostelId },
    (d) => {
      setStep(Math.min(d.step || 0, STEPS.length - 1))
      setForm({ ...INITIAL_FORM, ...(d.form || {}) })
      if (d.plan) setPlan(d.plan)
      if (d.hostelId) setHostelId(d.hostelId)
    },
    { userId: user?.id, enabled: !!user?.id })

  // Plan prices from the platform fee registry. A price is null while loading.
  const { fees } = usePlatformFees()
  const LISTING_PLANS = getFeeAmounts(fees).HOSTEL_LISTING_PLANS
  const plansReady = !!LISTING_PLANS[plan]?.price

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const text = (k) => (e) => set(k, e.target.value)
  const toggleAmenity = (id) => setForm((f) => ({
    ...f, amenities: f.amenities.includes(id) ? f.amenities.filter((a) => a !== id) : [...f.amenities, id],
  }))

  const errors = validate(step, form)
  const errorKeys = Object.keys(errors)
  const shown = showErrors ? errors : {}

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.getElementById('wizard-step-title')?.focus({ preventScroll: true })
    setShowErrors(false)
  }, [step])

  // Upload one photo; the picker keeps the returned address.
  const uploadPhoto = async (file) => {
    const ext = file.name.split('.').pop()
    const path = `hostels/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await uploadFile('property-images', path, file, { upsert: false })
    if (error) throw error
    return publicUrlFor('property-images', path)
  }

  // ── Save hostel (pending_review, unpaid) ──────────────────────────────
  const saveHostel = async () => {
    setSaving(true)
    try {
      const payload = {
        owner_id:         user.id,
        title:            form.title.trim(),
        description:      form.description.trim(),
        address:          form.address.trim(),
        city:             form.city.trim(),
        state:            form.state,
        institution_id:   null,
        institution_name: form.institution_name.trim() || null,
        distance_km:      form.distance_km ? Number(form.distance_km) : null,
        distance_label:   form.distance_label.trim() || null,
        room_type:        form.room_type,
        gender_policy:    form.gender_policy,
        rooms_available:  Number(form.rooms_available),
        total_rooms:      Number(form.total_rooms) || Number(form.rooms_available),
        price_per_year:   Number(form.price_per_year),
        caution_fee:      form.caution_fee ? Number(form.caution_fee) : 0,
        agency_fee:       form.agency_fee  ? Number(form.agency_fee)  : 0,
        amenities:        form.amenities,
        images:           form.images,
        status:           'pending_review',
        updated_at:       new Date().toISOString(),
      }

      let id = hostelId
      if (id) {
        // listing_paid and payment_ref are not in this payload: only a confirmed
        // payment sets them, so saving a paid listing never un-pays it.
        const { error } = await updateHostel(id, payload)
        if (error) throw error
      } else {
        const { data, error } = await insertHostel(payload)
        if (error) throw error
        id = data.id
        setHostelId(id)
      }
      return id
    } catch (err) {
      toast.error('We couldn\'t save your listing. Please try again.')
      console.error(err)
      return null
    } finally {
      setSaving(false)
    }
  }

  // ── Payment ────────────────────────────────────────────────────────────
  const handlePayment = async () => {
    const planMeta  = LISTING_PLANS[plan]
    if (!planMeta?.price) { toast.error('Prices are still loading. Try again in a moment.'); return }

    const id = hostelId || await saveHostel()
    if (!id) return

    const reference = generateReference()

    // The server creates the payment record and prices the plan from the
    // registry. The browser sends only the hostel and the plan.
    await initializeFlutterwavePayment({
      purpose:   'hostel_listing_fee',
      subject:   { hostel_id: id, plan },
      reference,
      onSuccess: () => {
        // The server unlocks the listing when Flutterwave confirms the charge
        // (api/flutterwave-webhook.js). The browser must not write payment
        // status: anything written here could be forged from the console.
        draft.clear()
        setPaymentDone(true)
        toast.success('Payment received. Your listing will be activated once it is confirmed.')
      },
      onClose: () => {
        toast('Payment cancelled. Your listing has been saved as a draft.', { icon: 'ℹ️' })
      },
    })
  }

  const goNext = async () => {
    if (errorKeys.length) {
      setShowErrors(true)
      const first = document.querySelector(`[data-field="f-${errorKeys[0]}"]`)
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      first?.querySelector('input,select,textarea,button')?.focus({ preventScroll: true })
      return
    }
    if (step === STEPS.length - 1) { handlePayment(); return }
    if (step === SAVE_AT) {
      // Save before going to the payment step
      const id = await saveHostel()
      if (!id) return
    }
    setStep((s) => s + 1)
  }

  if (paymentDone) return <PaidScreen />

  const firstYear = Number(form.price_per_year || 0) + Number(form.caution_fee || 0) + Number(form.agency_fee || 0)
  const last = step === STEPS.length - 1
  const nextLabel = last
    ? (!plansReady ? 'Loading prices…' : `Pay ${naira(LISTING_PLANS[plan].price)} and go live`)
    : step === SAVE_AT ? 'Save and continue' : 'Continue'

  return (
    <>
      <WizardShell
        eyebrow="List a student hostel"
        title="List your hostel"
        subtitle="Reach students looking near your campus. Five short steps, and your answers are saved as you go."
        steps={STEPS}
        step={step}
        onStepClick={(i) => setStep(i)}
        notice={<DraftNotice photosKept draft={draft} onStartOver={() => { setStep(0); setForm(INITIAL_FORM); setHostelId(null) }} />}
      >
        {step === 0 && (
          <div className="space-y-6">
            <StepHeading title="Tell us about the rooms">What students will be renting.</StepHeading>

            <Field id="f-title" label="Hostel name" error={shown.title}>
              <input className={`input ${inputClass}`} type="text" maxLength={80} autoComplete="off"
                placeholder="e.g. Grace Court Hostel, Peace Villa" value={form.title} onChange={text('title')} />
            </Field>

            <Field id="f-room_type" label="Room type" error={shown.room_type}>
              <div role="radiogroup" aria-label="Room type" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {ROOM_TYPES.map((r) => (
                  <ChoiceCard key={r.id} icon={r.icon} label={r.label} description={r.desc}
                    selected={form.room_type === r.id} onClick={() => set('room_type', r.id)} />
                ))}
              </div>
            </Field>

            <Field id="f-gender_policy" label="Who can live here?">
              <div role="radiogroup" aria-label="Who can live here?" className="grid grid-cols-3 gap-2.5">
                {GENDER_OPTIONS.map((g) => (
                  <ChoiceCard key={g.id} label={g.label} description={g.desc}
                    selected={form.gender_policy === g.id} onClick={() => set('gender_policy', g.id)} />
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="f-rooms_available" label="Rooms available" error={shown.rooms_available}>
                <input className={`input ${inputClass}`} placeholder="1" value={form.rooms_available} {...money('rooms_available', set)} />
              </Field>
              <Field id="f-total_rooms" label="Total rooms" optional>
                <input className={`input ${inputClass}`} placeholder="10" value={form.total_rooms} {...money('total_rooms', set)} />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <StepHeading title="Rent and fees">What a student pays. Be clear, since it avoids disputes later.</StepHeading>

            <Field id="f-price_per_year" label="Annual rent" error={shown.price_per_year} hint="Price per year (one academic session).">
              <NairaInput placeholder="e.g. 120,000" value={form.price_per_year} onChange={(v) => set('price_per_year', v)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="f-caution_fee" label="Caution fee" optional hint="Refundable when the student leaves.">
                <NairaInput placeholder="0" value={form.caution_fee} onChange={(v) => set('caution_fee', v)} />
              </Field>
              <Field id="f-agency_fee" label="Agency fee" optional>
                <NairaInput placeholder="0" value={form.agency_fee} onChange={(v) => set('agency_fee', v)} />
              </Field>
            </div>

            {firstYear > 0 && (
              <InfoBox icon={BanknotesIcon} title="What a student pays up front">
                <p className="text-lg font-bold text-forest">{naira(firstYear)}</p>
                <p className="mt-0.5">Rent plus caution and agency fees, as students will see it.</p>
              </InfoBox>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <StepHeading title="Where is it?">Students search by school first, so be exact.</StepHeading>

            <Field id="f-address" label="Street address" error={shown.address}>
              <input className={`input ${inputClass}`} type="text" autoComplete="off"
                placeholder="e.g. 14 Adeleke Street, beside GTBank" value={form.address} onChange={text('address')} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="f-city" label="City" error={shown.city}>
                <input className={`input ${inputClass}`} type="text" autoComplete="off" placeholder="e.g. Yaba" value={form.city} onChange={text('city')} />
              </Field>
              <Field id="f-state" label="State" error={shown.state}>
                <select className={`select ${inputClass}`} value={form.state} onChange={text('state')}>
                  <option value="">Select state</option>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            <Field id="f-institution_name" label="Nearest university, polytechnic or college" error={shown.institution_name}
              hint="Type the name exactly as students would search for it.">
              <input className={`input ${inputClass}`} type="text" autoComplete="off" placeholder="e.g. University of Lagos"
                value={form.institution_name} onChange={text('institution_name')} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="f-distance_km" label="Distance (km)" optional hint="Roughly, on foot.">
                <input className={`input ${inputClass}`} type="text" inputMode="decimal" placeholder="0.5"
                  value={form.distance_km} onChange={(e) => set('distance_km', e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} />
              </Field>
              <Field id="f-distance_label" label="How students see it" optional>
                <input className={`input ${inputClass}`} type="text" maxLength={30} placeholder="5 min walk" value={form.distance_label} onChange={text('distance_label')} />
              </Field>
            </div>

            <InfoBox icon={InformationCircleIcon}>
              A DealMatch verifier may visit the address before activating your listing, to protect students from fake hostels.
            </InfoBox>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <StepHeading title="What it offers, and how it looks">More amenities and clear photos bring more enquiries.</StepHeading>

            <div>
              <p className="mb-2 text-sm font-bold">Amenities <span className="text-xs font-medium text-warm">Optional</span></p>
              <div className="flex flex-wrap gap-2">
                {AMENITIES.map((a) => <Chip key={a.id} selected={form.amenities.includes(a.id)} onClick={() => toggleAmenity(a.id)}>{a.label}</Chip>)}
              </div>
            </div>

            <Field id="f-images" label={`Photos (${form.images.length} of ${MAX_PHOTOS})`} error={shown.images}
              hint="JPG, PNG or WebP, up to 10 MB each. The first photo is the cover.">
              <PhotoPicker images={form.images.map((url, i) => ({ url, is_primary: i === 0 }))} max={MAX_PHOTOS} invalid={!!shown.images}
                upload={uploadPhoto}
                onChange={(next) => setForm((f) => {
                  const cur = f.images.map((url, i) => ({ url, is_primary: i === 0 }))
                  const list = typeof next === 'function' ? next(cur) : next
                  // The main photo goes first, since the first one is the cover.
                  const main = list.find((i) => i.is_primary)
                  const ordered = main ? [main, ...list.filter((i) => i !== main)] : list
                  return { ...f, images: ordered.map((i) => i.url) }
                })} />
            </Field>

            <Field id="f-description" label="Description" optional hint="House rules, the neighbourhood, and what makes it good for students.">
              <textarea className={`input ${inputClass} resize-none`} rows={4} placeholder="Describe your hostel…"
                value={form.description} onChange={text('description')} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <StepHeading title="Choose your listing plan">Students browse for free. You pay a small fee to list your hostel.</StepHeading>

            <div role="radiogroup" aria-label="Listing plan" className="space-y-2.5">
              {Object.entries(LISTING_PLANS).map(([key, p]) => (
                <button key={key} type="button" role="radio" aria-checked={plan === key} onClick={() => setPlan(key)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${plan === key ? 'border-terracotta bg-orange-pale' : 'border-line bg-white hover:border-deep/30'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{p.name}</span>
                      {p.badge ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${plan === key ? 'bg-terracotta text-white' : 'bg-line text-deep'}`}>{p.badge}</span> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-warm">{p.duration}</span>
                    {p.saving ? <span className="mt-0.5 block text-xs font-bold text-forest">{p.saving}</span> : null}
                  </span>
                  <span className="text-right">
                    <span className={`block font-display text-xl ${plan === key ? 'text-terracotta-dark' : 'text-deep'}`}>{p.price ? naira(p.price) : '…'}</span>
                  </span>
                  {plan === key ? <CheckCircleSolid className="h-5 w-5 flex-shrink-0 text-terracotta" aria-hidden="true" /> : null}
                </button>
              ))}
            </div>

            <ul className="space-y-2 rounded-2xl border border-line bg-cream/60 p-4 text-sm">
              <li className="mb-1 text-xs font-bold uppercase tracking-wider text-warm">What is included</li>
              {[
                'Listed on the student hostels page',
                'Visible to verified students near your school',
                'Enquiries through WhatsApp and in the app',
                'Verified badge after inspection',
                'Edit or pause your listing any time',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs">
                  <CheckCircleIcon className="mt-px h-4 w-4 flex-shrink-0 text-forest" aria-hidden="true" />{f}
                </li>
              ))}
            </ul>

            <InfoBox icon={LockClosedIcon}>
              Payment is secured by Flutterwave. Your listing goes live once the payment is confirmed and the details are verified. It is saved as a draft until then, so you can pay any time.
            </InfoBox>

            <dl className="divide-y divide-line rounded-2xl border border-line bg-white">
              {[
                { to: 0, label: 'Hostel', value: form.title, sub: ROOM_TYPES.find((r) => r.id === form.room_type)?.label },
                { to: 1, label: 'Annual rent', value: naira(form.price_per_year), sub: `${naira(firstYear)} up front` },
                { to: 2, label: 'Location', value: `${form.city}, ${form.state}`, sub: form.institution_name },
                { to: 3, label: 'Photos', value: `${form.images.length} photo${form.images.length === 1 ? '' : 's'}`, sub: `${form.amenities.length} amenities` },
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
          </div>
        )}
      </WizardShell>

      <WizardActions
        onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
        onNext={goNext}
        nextLabel={nextLabel}
        last={last}
        busy={saving || (last && !plansReady)}
        busyLabel={last && !plansReady ? 'Loading prices…' : 'Saving…'}
        hint={showErrors && errorKeys.length ? `${errorKeys.length === 1 ? '1 thing needs' : `${errorKeys.length} things need`} your attention above` : null}
      />
    </>
  )
}

function PaidScreen() {
  const next = [
    { icon: CheckCircleSolid, title: 'Payment received', text: 'We are confirming it with Flutterwave.', done: true },
    { icon: ShieldCheckIcon, title: 'Checked by a verifier', text: 'Our team verifies the details, and may visit the address.' },
    { icon: ClockIcon, title: 'Goes live', text: 'Students see your hostel as soon as it is approved.' },
  ]
  return (
    <div className="min-h-screen bg-cream px-4 pb-10 pt-12 text-deep">
      <div className="mx-auto max-w-md text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest text-white shadow-glow">
          <CheckCircleIcon className="h-9 w-9" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-3xl">Your listing is submitted</h1>
        <p className="mt-2 text-sm text-warm">It is under review. Once the details are verified it goes live, and you can follow its status on your dashboard.</p>

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
          <Link to="/dashboard" className="btn-primary block w-full !py-3.5 text-center">Go to dashboard</Link>
          <Link to="/student-hostels" className="btn-secondary block w-full !py-3.5 text-center">Browse hostels</Link>
        </div>
      </div>
    </div>
  )
}
