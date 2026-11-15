import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BriefcaseIcon, CheckCircleIcon, ClockIcon, InformationCircleIcon, PencilSquareIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import { useFormDraft } from '@/hooks/useFormDraft'
import { insertProfessionalApplication } from '@/data/professionalsRepository'
import { getFeeAmounts, subscribeProfessional } from '@/lib/flutterwave'
import { usePlatformFees, feeText } from '@/lib/platformFees'
import DraftNotice from '@/components/ui/DraftNotice'
import { WizardShell, WizardActions, StepHeading, Field, InfoBox, inputClass } from '@/components/ui/WizardKit'

// Comprehensive list of real-estate and property-related professions.
// Grouped by category so the dropdown is easy to scan.
// 'other' at the end lets someone type in anything not listed.
const PROFESSION_GROUPS = [
  {
    group: 'Surveying & Assessment',
    options: [
      { id: 'land_surveyor',        label: 'Land Surveyor' },
      { id: 'quantity_surveyor',    label: 'Quantity Surveyor' },
      { id: 'property_valuer',      label: 'Property Valuer / Appraiser' },
      { id: 'building_surveyor',    label: 'Building Surveyor' },
    ],
  },
  {
    group: 'Inspection & Engineering',
    options: [
      { id: 'property_inspector',   label: 'Property Inspector' },
      { id: 'structural_engineer',  label: 'Structural Engineer' },
      { id: 'civil_engineer',       label: 'Civil Engineer' },
      { id: 'electrical_engineer',  label: 'Electrical Engineer' },
      { id: 'mechanical_engineer',  label: 'Mechanical Engineer' },
    ],
  },
  {
    group: 'Legal & Finance',
    options: [
      { id: 'real_estate_lawyer',   label: 'Real Estate Lawyer' },
      { id: 'conveyancer',          label: 'Conveyancer' },
      { id: 'mortgage_lender',      label: 'Mortgage Lender' },
      { id: 'mortgage_broker',      label: 'Mortgage Broker' },
      { id: 'financial_advisor',    label: 'Financial Advisor (Property)' },
    ],
  },
  {
    group: 'Architecture & Design',
    options: [
      { id: 'architect',            label: 'Architect' },
      { id: 'interior_designer',    label: 'Interior Designer' },
      { id: 'urban_planner',        label: 'Urban Planner' },
      { id: 'landscape_architect',  label: 'Landscape Architect' },
    ],
  },
  {
    group: 'Construction & Trades',
    options: [
      { id: 'building_contractor',  label: 'Building Contractor' },
      { id: 'plumber',              label: 'Plumber' },
      { id: 'electrician',          label: 'Electrician' },
      { id: 'painter',              label: 'Painter / Decorator' },
      { id: 'tiler',                label: 'Tiler / Floor Layer' },
      { id: 'carpenter',            label: 'Carpenter / Joiner' },
    ],
  },
  {
    group: 'Property Management',
    options: [
      { id: 'property_manager',     label: 'Property Manager' },
      { id: 'facility_manager',     label: 'Facility Manager' },
      { id: 'estate_manager',       label: 'Estate Manager' },
      { id: 'property_agent',       label: 'Property Agent / Realtor' },
    ],
  },
  {
    group: 'Development & Investment',
    options: [
      { id: 'property_developer',   label: 'Property Developer' },
      { id: 'real_estate_investor', label: 'Real Estate Investor' },
      { id: 'land_developer',       label: 'Land Developer' },
    ],
  },
]

// Flat map for easy lookup
const ALL_PROFESSIONS = PROFESSION_GROUPS.flatMap(g => g.options)

// Map a profession id to a PROFESSIONAL_PLANS key for billing.
// Most map to 'surveyor'. Prices come from the platform fee registry.
const planKeyFor = (id) => {
  if (!id || id === 'other') return 'surveyor'
  if (id.includes('lawyer') || id.includes('conveyancer')) return 'lawyer'
  if (id.includes('lender') || id.includes('broker') || id.includes('advisor')) return 'lender'
  if (id.includes('inspector') || id.includes('engineer') || id.includes('architect')) return 'inspector'
  return 'surveyor'
}

const STEPS = ['Profession', 'Your details', 'Plan and payment']

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`
const phoneDigits = (v) => String(v).replace(/[^\d+]/g, '')
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

function validate(step, form) {
  const e = {}
  if (step === 0) {
    if (!form.profession_id) e.profession_id = 'Choose your profession.'
    else if (form.profession_id === 'other' && !form.custom_profession.trim()) e.custom_profession = 'Type your profession.'
  }
  if (step === 1) {
    if (form.full_name.trim().length < 3) e.full_name = 'Enter your full name.'
    if (phoneDigits(form.phone).replace('+', '').length < 10) e.phone = 'Enter a phone number with at least 10 digits.'
    if (!isEmail(form.email)) e.email = 'Enter a valid email address.'
  }
  return e
}

export default function ApplyProfessionalPage() {
  const { user, profile } = useAuth()
  const { requireVerification, isVerified, isPending } = useVerificationGuard()
  const navigate = useNavigate()
  const [step, setStep]         = useState(0)
  const [saving, setSaving]     = useState(false)
  const [planType, setPlanType] = useState('monthly')
  const [showErrors, setShowErrors] = useState(false)
  const firstRender = useRef(true)
  // Plan prices from the platform fee registry. A price is null while loading.
  const { fees } = usePlatformFees()
  const monthlyText = feeText(fees, 'professional_monthly')

  const [form, setForm] = useState({
    profession_id:   '',   // chosen from the list
    custom_profession: '', // typed if 'other' is chosen
    full_name:       profile?.full_name || '',
    company:         '',
    phone:           profile?.phone || '',
    email:           user?.email || '',
    license_no:      '',
    coverage_areas:  '',
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Keeps the answers on this device so a dropped connection or reload never starts it over.
  const draft = useFormDraft('apply-professional', { step, planType, form },
    (d) => { setStep(Math.min(d.step || 0, STEPS.length - 1)); if (d.planType) setPlanType(d.planType); setForm((f) => ({ ...f, ...(d.form || {}) })) },
    { userId: user?.id, enabled: !!user?.id })

  const selectedLabel = form.profession_id === 'other'
    ? (form.custom_profession || 'Other (specify below)')
    : ALL_PROFESSIONS.find((p) => p.id === form.profession_id)?.label || ''

  const professionForDB = form.profession_id === 'other'
    ? (form.custom_profession || 'Other')
    : selectedLabel

  const planKey = planKeyFor(form.profession_id)
  const plan    = getFeeAmounts(fees).PROFESSIONAL_PLANS[planKey]
  const chosenAmount = planType === 'annual' ? plan.annualFee : plan.monthlyFee

  const errors = validate(step, form)
  const errorKeys = Object.keys(errors)
  const shown = showErrors ? errors : {}

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.getElementById('wizard-step-title')?.focus({ preventScroll: true })
    setShowErrors(false)
  }, [step])

  const handlePay = async () => {
    if (!user) { toast.error('Sign in to continue'); return }
    if (!(chosenAmount > 0)) { toast.error('Prices are still loading. Try again in a moment.'); return }

    // Providers should not go live until verification is approved - this
    // sends unverified applicants to /verify-identity first and brings them
    // straight back here afterward. (The webhook and a DB trigger also
    // enforce this server-side, so this is a friendlier front door, not the
    // only line of defense.)
    const ok = await requireVerification('list_service')
    if (!ok) return

    setSaving(true)

    // Insert using live schema column names exactly
    const { data: application, error } = await insertProfessionalApplication({
      user_id:           user.id,
      professional_type: professionForDB,   // the actual profession label/name
      full_name:         form.full_name.trim(),
      company_name:      form.company.trim() || null,
      phone:             form.phone.trim(),
      email:             form.email.trim(),
      license_number:    form.license_no.trim() || null,
      coverage_areas:    form.coverage_areas.trim() || null,
      plan_type:         planType,
      status:            'pending',
    })

    if (error || !application) {
      toast.error('We couldn\'t save your application: ' + (error?.message || 'unknown error'))
      setSaving(false)
      return
    }

    await subscribeProfessional({
      fees,
      applicationId:    application.id,
      userId:           user.id,
      professionalType: planKey,
      email:            form.email.trim(),
      planType,
      onSuccess: () => {
        draft.clear()
        toast.success('Payment received. Your profile goes live shortly.')
        navigate('/professionals')
      },
      onClose: () => {
        toast('Payment cancelled. You can complete it anytime.', { icon: 'ℹ️' })
        setSaving(false)
      },
    })
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
    else handlePay()
  }

  const last = step === STEPS.length - 1
  const priceReady = chosenAmount > 0
  const verifyNotice = !isVerified() && !isPending() ? (
    <div className="mb-5 flex items-start gap-3 rounded-[24px_24px_24px_8px] border border-sun/50 bg-sun/15 p-4 text-sm">
      <ShieldCheckIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-forest" aria-hidden="true" />
      <p>
        <span className="font-bold">Fill this in now, verify before you pay.</span>{' '}
        We confirm your identity before your profile goes live.{' '}
        <Link to="/verify-identity" state={{ returnTo: '/apply-professional' }} className="font-bold text-terracotta-dark underline underline-offset-2">Verify now</Link>
        . Your answers stay saved.
      </p>
    </div>
  ) : null

  return (
    <>
      <WizardShell
        eyebrow="Join as a professional"
        title="Get matched with clients"
        subtitle="Clients actively look for your services on DealMatch. Three short steps, and your answers are saved as you go."
        steps={STEPS}
        step={step}
        onStepClick={(i) => setStep(i)}
        notice={<>{verifyNotice}<DraftNotice photosKept draft={draft} onStartOver={() => setStep(0)} /></>}
      >
        {step === 0 && (
          <div className="space-y-6">
            <StepHeading title="What is your profession?">Pick the closest match, or choose Other to type your own.</StepHeading>

            <Field id="f-profession_id" label="Profession" error={shown.profession_id}>
              <select className={`select ${inputClass}`} value={form.profession_id}
                onChange={(e) => setForm((f) => ({ ...f, profession_id: e.target.value, custom_profession: '' }))}>
                <option value="">Select your profession</option>
                {PROFESSION_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </optgroup>
                ))}
                <optgroup label="Not listed?">
                  <option value="other">Other (I will specify)</option>
                </optgroup>
              </select>
            </Field>

            {form.profession_id === 'other' && (
              <Field id="f-custom_profession" label="Your profession" error={shown.custom_profession}>
                <input className={`input ${inputClass}`} type="text" autoComplete="off" maxLength={60}
                  placeholder="e.g. Environmental consultant, geotechnical engineer"
                  value={form.custom_profession} onChange={set('custom_profession')} />
              </Field>
            )}

            {form.profession_id && form.profession_id !== 'other' && (
              <InfoBox icon={CheckCircleIcon} title={`${selectedLabel} selected`}>
                {monthlyText ? `Every profession is listed at ${monthlyText} a month.` : 'Every profession is listed at the same monthly rate.'}
              </InfoBox>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <StepHeading title="Your details">Tell us who you are and how to reach you.</StepHeading>

            <p className="flex items-center gap-2 rounded-full bg-orange-pale px-4 py-2 text-xs font-semibold text-terracotta-dark">
              <BriefcaseIcon className="h-4 w-4" aria-hidden="true" /> Listing as {professionForDB}
            </p>

            <Field id="f-full_name" label="Full name" error={shown.full_name}>
              <input className={`input ${inputClass}`} type="text" autoComplete="name" placeholder="Your legal full name"
                value={form.full_name} onChange={set('full_name')} />
            </Field>

            <Field id="f-company" label="Company or firm" optional>
              <input className={`input ${inputClass}`} type="text" autoComplete="organization" placeholder="e.g. ABC Surveyors Ltd"
                value={form.company} onChange={set('company')} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="f-phone" label="Phone" error={shown.phone}>
                <input className={`input ${inputClass}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="08012345678"
                  value={form.phone} onChange={set('phone')} />
              </Field>
              <Field id="f-email" label="Email" error={shown.email}>
                <input className={`input ${inputClass}`} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
                  value={form.email} onChange={set('email')} />
              </Field>
            </div>

            <Field id="f-license_no" label="Licence or registration number" optional hint="It helps clients trust you. We check it during verification.">
              <input className={`input ${inputClass}`} type="text" autoComplete="off" placeholder="e.g. NIS/2024/001"
                value={form.license_no} onChange={set('license_no')} />
            </Field>

            <Field id="f-coverage_areas" label="Where do you work?" optional hint="Cities or states, separated by commas.">
              <input className={`input ${inputClass}`} type="text" autoComplete="off" placeholder="e.g. Lagos, Abuja, Port Harcourt"
                value={form.coverage_areas} onChange={set('coverage_areas')} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <StepHeading title="Choose your plan">Pay to activate your profile.</StepHeading>

            {plan?.features?.length ? (
              <ul className="space-y-2 rounded-2xl border border-line bg-cream/60 p-4">
                <li className="mb-1 text-xs font-bold uppercase tracking-wider text-warm">{professionForDB}: what you get</li>
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs">
                    <CheckCircleIcon className="mt-px h-4 w-4 flex-shrink-0 text-forest" aria-hidden="true" />{f}
                  </li>
                ))}
              </ul>
            ) : null}

            <div role="radiogroup" aria-label="Billing" className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'monthly', label: 'Monthly', price: plan.monthlyFee },
                { id: 'annual',  label: 'Annual', price: plan.annualFee, badge: plan.annualSavingPercent ? `Save ${plan.annualSavingPercent}%` : null },
              ].map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={planType === p.id} onClick={() => setPlanType(p.id)}
                  className={`rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${planType === p.id ? 'border-terracotta bg-orange-pale' : 'border-line bg-white hover:border-deep/30'}`}>
                  <span className="flex items-center justify-between gap-2 text-xs font-bold text-warm">
                    {p.label}
                    {p.badge ? <span className="rounded-full bg-forest px-2 py-0.5 text-[11px] text-white">{p.badge}</span> : null}
                  </span>
                  <span className={`mt-1 block font-display text-2xl ${planType === p.id ? 'text-terracotta-dark' : 'text-deep'}`}>
                    {p.price ? naira(p.price) : '…'}
                  </span>
                </button>
              ))}
            </div>

            <InfoBox icon={ClockIcon} title="After you pay">
              Your profile is checked, then goes live. Unverified applicants are asked to confirm their identity first.
            </InfoBox>

            <dl className="divide-y divide-line rounded-2xl border border-line bg-white">
              {[
                { to: 0, label: 'Profession', value: professionForDB, sub: form.company || 'No firm added' },
                { to: 1, label: 'Contact', value: form.full_name, sub: `${form.phone} · ${form.email}` },
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

            <p className="flex items-start gap-2 text-xs text-warm">
              <InformationCircleIcon className="mt-px h-4 w-4 flex-shrink-0" aria-hidden="true" />
              Payment is secured by Flutterwave.
            </p>
          </div>
        )}
      </WizardShell>

      <WizardActions
        onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
        onNext={goNext}
        last={last}
        nextLabel={last ? (priceReady ? `Pay ${naira(chosenAmount)} and activate` : 'Loading prices…') : 'Continue'}
        busy={saving || (last && !priceReady)}
        busyLabel={saving ? 'Processing…' : 'Loading prices…'}
        hint={showErrors && errorKeys.length ? `${errorKeys.length === 1 ? '1 thing needs' : `${errorKeys.length} things need`} your attention above` : null}
      />
    </>
  )
}
