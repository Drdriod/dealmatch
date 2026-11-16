import React, { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon, ArrowRightOnRectangleIcon, BanknotesIcon, BriefcaseIcon, CameraIcon, CheckBadgeIcon, CheckIcon,
  ClockIcon, HeartIcon, HomeIcon, PencilSquareIcon, ShieldCheckIcon, ShieldExclamationIcon, Squares2X2Icon, UserIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { uploadAvatar, supabase } from '@/lib/supabase'
import { markOffersServices } from '@/data/profileRepository'
import { loadProviderSummary } from '@/data/verificationRepository'
import DeleteAccountPanel from '@/components/DeleteAccountPanel'
import { Field, inputClass } from '@/components/ui/WizardKit'

const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger',
  'Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe',
  'Zamfara','Abuja (FCT)',
]

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
const pillButton = `inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-xs font-bold text-deep hover:border-deep/30 ${focusRing}`

const personalFrom = (p) => ({
  full_name: p?.full_name || '', phone: p?.phone || '', bio: p?.bio || '', state: p?.state || '', city: p?.city || '',
})
const bankFrom = (p) => ({
  bank_name: p?.bank_name || '', account_name: p?.account_name || '', account_number: p?.account_number || '', routing_number: p?.routing_number || '',
})

function validatePersonal(f) {
  const e = {}
  if (!f.full_name.trim()) e.full_name = 'Enter your full name'
  if (f.phone.trim() && f.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone number (at least 10 digits)'
  return e
}
function validateBank(f) {
  const e = {}
  if (f.account_number && !/^\d{10}$/.test(f.account_number)) e.account_number = 'Your account number should be 10 digits'
  if (f.account_number && !f.bank_name.trim()) e.bank_name = 'Enter your bank name'
  if (f.account_number && !f.account_name.trim()) e.account_name = 'Enter the name on the account'
  return e
}

// A glass section with its own Edit / Save / Cancel, so each part saves on its own.
function SectionCard({ title, subtitle, icon: Icon, editing, saving, onEdit, onCancel, onSave, action, children }) {
  return (
    <section className="mb-5 rounded-[32px_32px_32px_10px] border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[10rem] flex-1">
          <h2 className="flex items-center gap-2 font-display text-xl">
            {Icon ? <Icon className="h-5 w-5 flex-shrink-0 text-terracotta" aria-hidden="true" /> : null}
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-xs text-warm">{subtitle}</p> : null}
        </div>
        {action || (onEdit ? (
          editing ? (
            <div className="ml-auto flex flex-shrink-0 items-center gap-2">
              <button type="button" onClick={onCancel} disabled={saving} className={pillButton}>
                <XMarkIcon className="h-4 w-4" aria-hidden="true" /> Cancel
              </button>
              <button type="button" onClick={onSave} disabled={saving}
                className={`inline-flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-xs font-bold text-white hover:bg-terracotta-dark disabled:opacity-60 ${focusRing}`}>
                <CheckIcon className="h-4 w-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={onEdit} className={`flex-shrink-0 ${pillButton}`}>
              <PencilSquareIcon className="h-4 w-4" aria-hidden="true" /> Edit
            </button>
          )
        ) : null)}
      </div>
      {children}
    </section>
  )
}

// A label and value, for the read-only view of a section.
function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line/70 py-2.5 first:border-t-0">
      <dt className="flex-shrink-0 text-xs font-bold uppercase tracking-wider text-warm">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-semibold text-deep">
        {children || <span className="font-medium text-warm">Not added</span>}
      </dd>
    </div>
  )
}

function Badge({ tone, icon: Icon, children }) {
  const palette = {
    good: 'bg-forest-pale text-forest-dark',
    warn: 'bg-sun/30 text-deep',
    bad: 'bg-orange-pale text-terracotta-dark',
    quiet: 'bg-white/15 text-white/80',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ${palette}`}>
      <Icon className="h-4 w-4" aria-hidden="true" /> {children}
    </span>
  )
}

function VerificationCard({ profile }) {
  const idStatus = profile?.identity_verification_status
  const box = 'mb-5 rounded-[28px_28px_28px_8px] border p-5'
  if (idStatus === 'approved' || profile?.is_live_verified) {
    return (
      <div className={`${box} flex items-center gap-3 border-forest/20 bg-forest-pale`}>
        <ShieldCheckIcon className="h-6 w-6 flex-shrink-0 text-forest" aria-hidden="true" />
        <p className="text-sm font-bold text-forest-dark">Identity verified</p>
      </div>
    )
  }
  if (idStatus === 'submitted') {
    return (
      <div className={`${box} flex items-start gap-3 border-sun/50 bg-sun/15`}>
        <ClockIcon className="mt-0.5 h-6 w-6 flex-shrink-0 text-deep" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold">Verification under review</p>
          <p className="mt-0.5 text-xs leading-relaxed text-warm">
            Your ID and selfie have been submitted. Our team will review and notify you here (and by email) within 24-48 hours.
          </p>
        </div>
      </div>
    )
  }
  const rejected = idStatus === 'rejected'
  return (
    <div className={`${box} border-terracotta/30 bg-orange-pale`}>
      <div className="flex items-start gap-3">
        <ShieldExclamationIcon className="mt-0.5 h-6 w-6 flex-shrink-0 text-terracotta" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-bold">{rejected ? 'Verification not approved' : 'Verify your identity'}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-warm">
            {rejected
              ? (profile?.identity_rejection_note ? `Reason: ${profile.identity_rejection_note}` : 'Please check your ID photo and selfie, then send them again.')
              : 'Upload your government-issued ID and take a selfie. Needed before you can complete deals.'}
          </p>
        </div>
      </div>
      <Link to="/verify-identity" className={`btn-primary mt-4 flex w-full items-center justify-center gap-2 !px-6 !py-3 text-sm ${focusRing}`}>
        <ShieldCheckIcon className="h-5 w-5" aria-hidden="true" /> {rejected ? 'Resubmit verification' : 'Verify my identity'}
      </Link>
    </div>
  )
}

export default function ProfilePage() {
  const { user, profile, updateUserProfile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [personal, setPersonal] = useState(() => personalFrom(profile))
  const [bank, setBank] = useState(() => bankFrom(profile))
  const [editingPersonal, setEditingPersonal] = useState(false)
  const [editingBank, setEditingBank] = useState(false)
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [savingBank, setSavingBank] = useState(false)
  const [personalErrors, setPersonalErrors] = useState({})
  const [bankErrors, setBankErrors] = useState({})
  const [uploading, setUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [becomingProvider, setBecomingProvider] = useState(false)
  const [providerInfo, setProviderInfo] = useState(null) // { level, submission } once loaded
  const [loadingProvider, setLoadingProvider] = useState(true)

  // Keep the fields in step with the saved profile whenever a section is not being edited.
  useEffect(() => { if (!editingPersonal) setPersonal(personalFrom(profile)) }, [profile, editingPersonal])
  useEffect(() => { if (!editingBank) setBank(bankFrom(profile)) }, [profile, editingBank])

  const setP = (k) => (e) => { setPersonal((f) => ({ ...f, [k]: e.target.value })); setPersonalErrors((er) => (er[k] ? { ...er, [k]: '' } : er)) }
  const setB = (k) => (e) => {
    const v = k === 'account_number' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value
    setBank((f) => ({ ...f, [k]: v })); setBankErrors((er) => (er[k] ? { ...er, [k]: '' } : er))
  }

  // Provider section data: current tier + most recent Skill submission
  // (approved or otherwise), so someone who has already submitted evidence
  // sees what they submitted rather than a blank form every time.
  useEffect(() => {
    if (!user?.id || !profile?.offers_services) { setLoadingProvider(false); return }
    (async () => {
      const [{ data: vp }, { data: sub }] = await loadProviderSummary(user.id)
      setProviderInfo({ level: vp?.level || 0, submission: sub || null })
      setLoadingProvider(false)
    })()
  }, [user?.id, profile?.offers_services])

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('That photo is over 5 MB. Choose a smaller one.'); return }
    setAvatarError('')
    setUploading(true)
    const { url, error } = await uploadAvatar(user.id, file)
    if (error) { setAvatarError('We couldn\'t upload that: ' + error.message); setUploading(false); return }
    await updateUserProfile({ avatar_url: url })
    // is_photo_verified is set only by an admin after identity review
    await refreshProfile()
    toast.success('Photo updated.')
    setUploading(false)
  }

  const focusFirst = (errs) => {
    const first = Object.keys(errs)[0]
    document.querySelector(`[data-field="${first}"]`)?.querySelector('input,select,textarea')?.focus()
  }

  const savePersonal = async () => {
    const errs = validatePersonal(personal)
    setPersonalErrors(errs)
    if (Object.keys(errs).length) return focusFirst(errs)
    setSavingPersonal(true)
    const { error } = await updateUserProfile({ ...personal, full_name: personal.full_name.trim() })
    setSavingPersonal(false)
    if (error) { toast.error('We couldn\'t save that: ' + error.message); return }
    await refreshProfile()
    setEditingPersonal(false)
    toast.success('Details updated.')
  }

  const saveBank = async () => {
    const errs = validateBank(bank)
    setBankErrors(errs)
    if (Object.keys(errs).length) return focusFirst(errs)
    setSavingBank(true)
    const { error } = await updateUserProfile(bank)
    setSavingBank(false)
    if (error) { toast.error('We couldn\'t save that: ' + error.message); return }
    await refreshProfile()
    setEditingBank(false)
    toast.success('Payout details updated.')
  }

  const cancelPersonal = () => { setEditingPersonal(false); setPersonalErrors({}) }
  const cancelBank = () => { setEditingBank(false); setBankErrors({}) }

  // Robust sign-out: calls supabase directly, then hard-redirect
  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await supabase.auth.signOut({ scope: 'local' })
      toast.success('Signed out')
      // Hard reload clears all in-memory state and React context
      window.location.href = '/'
    } catch (err) {
      console.error('Sign-out error:', err)
      window.location.href = '/'
    }
  }

  // "Become a Provider" is a real, honest toggle (not inferred from
  // verification state). Saying yes here never grants provider status by
  // itself; it opens the door to actually submitting evidence, which staff then review.
  const handleBecomeProvider = async () => {
    if (!user) return
    setBecomingProvider(true)
    const { error } = await markOffersServices(user.id)
    setBecomingProvider(false)
    if (error) { toast.error('We couldn\'t save that. Please try again.'); return }
    await refreshProfile()
    toast.success("You're on your way. Add your details to publish your offer.")
    navigate('/verify-skill')
  }

  const verificationLevel = profile?.is_live_verified ? 'live' : profile?.avatar_url ? 'photo' : 'none'
  const isProvider = !!profile?.offers_services
  const skillLevel = providerInfo?.level || 0
  const skillPending = providerInfo?.submission?.status === 'pending'
  const sub = providerInfo?.submission?.submission_data
  const maskedAccount = profile?.account_number ? `${'•'.repeat(6)}${profile.account_number.slice(-4)}` : ''

  const quickLinks = [
    { to: '/dashboard', icon: Squares2X2Icon, label: 'Dashboard' },
    { to: '/manage-listings', icon: HomeIcon, label: 'My Offers' },
    { to: '/matches', icon: HeartIcon, label: 'My Matches' },
  ]
  const tile = `flex items-center gap-3 rounded-[24px_24px_24px_8px] border border-white/70 bg-white/80 p-4 text-sm font-bold shadow-card backdrop-blur-xl transition-transform hover:-translate-y-0.5 ${focusRing}`

  return (
    <div className="min-h-screen bg-cream pb-28 pt-8 text-deep">
      <div className="mx-auto max-w-2xl px-4">
        <h1 className="mb-4 font-display text-3xl">Account settings</h1>

        {/* Profile hero */}
        <div className="relative mb-5 overflow-hidden rounded-[40px_40px_40px_12px] bg-forest-dark p-6 text-center text-white shadow-soft">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-[60%_40%_55%_45%] bg-terracotta/40 blur-2xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-[45%_55%_40%_60%] bg-forest/60 blur-2xl" />
          <div className="relative flex flex-col items-center">
            <div className="relative mb-4">
              <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white/40 bg-white/10">
                {uploading ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                ) : profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/80">
                    <UserIcon className="h-10 w-10" aria-hidden="true" />
                  </div>
                )}
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Change profile photo"
                className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-forest-dark bg-terracotta text-white hover:bg-terracotta-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <CameraIcon className="h-5 w-5" aria-hidden="true" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleAvatarChange} />
            </div>

            <h2 className="font-display text-2xl">{profile?.full_name || 'Your name'}</h2>
            <p className="mt-0.5 break-all text-xs text-white/70">{user?.email}</p>
            {profile?.bio ? <p className="mt-2 max-w-xs text-xs text-white/70">{profile.bio}</p> : null}
            {avatarError ? <p role="alert" className="mt-2 rounded-full bg-orange-pale px-3 py-1 text-xs font-bold text-terracotta-dark">{avatarError}</p> : null}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {verificationLevel === 'live' ? <Badge tone="good" icon={ShieldCheckIcon}>Identity verified</Badge>
                : verificationLevel === 'photo' ? <Badge tone="warn" icon={CameraIcon}>Photo uploaded</Badge>
                : <Badge tone="bad" icon={ShieldExclamationIcon}>Not verified</Badge>}
              {isProvider ? (
                skillLevel >= 2
                  ? <Badge tone="good" icon={CheckBadgeIcon}>{skillLevel >= 3 ? 'Trusted provider' : 'Skill verified'}</Badge>
                  : <Badge tone="quiet" icon={CheckBadgeIcon}>{skillPending ? 'Skill: under review' : 'Skill not verified'}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <VerificationCard profile={profile} />

        {/* Personal details */}
        <SectionCard title="Your details" icon={UserIcon} editing={editingPersonal} saving={savingPersonal}
          onEdit={() => setEditingPersonal(true)} onCancel={cancelPersonal} onSave={savePersonal}>
          {editingPersonal ? (
            <div className="space-y-4">
              <Field id="full_name" label="Full name" error={personalErrors.full_name}>
                <input value={personal.full_name} onChange={setP('full_name')} placeholder="Your full name" autoComplete="name" className={`input ${inputClass}`} />
              </Field>
              <Field id="phone" label="Phone" optional error={personalErrors.phone}>
                <input type="tel" value={personal.phone} onChange={setP('phone')} placeholder="e.g. 08012345678" autoComplete="tel" className={`input ${inputClass}`} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="state" label="State" optional>
                  <select value={personal.state} onChange={setP('state')} className={`select ${inputClass}`}>
                    <option value="">Select state…</option>
                    {NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field id="city" label="City" optional>
                  <input value={personal.city} onChange={setP('city')} placeholder="Your city" className={`input ${inputClass}`} />
                </Field>
              </div>
              <Field id="bio" label="Bio" optional hint="A line or two about you. It shows on your profile.">
                <textarea value={personal.bio} onChange={setP('bio')} rows={3} placeholder="A short bio…" className={`input ${inputClass} min-h-[88px]`} />
              </Field>
            </div>
          ) : (
            <dl>
              <Row label="Name">{profile?.full_name}</Row>
              <Row label="Phone">{profile?.phone}</Row>
              <Row label="Location">{[profile?.city, profile?.state].filter(Boolean).join(', ')}</Row>
              <Row label="Bio">{profile?.bio}</Row>
            </dl>
          )}
        </SectionCard>

        {/* Provider section: only shown if the person offers services */}
        {isProvider ? (
          <SectionCard title="Offer details" icon={BriefcaseIcon}
            action={<Link to="/verify-skill" className={`flex-shrink-0 ${pillButton}`}><PencilSquareIcon className="h-4 w-4" aria-hidden="true" /> {skillLevel >= 2 ? 'Update' : 'Submit'}</Link>}>
            {loadingProvider ? (
              <div className="flex justify-center py-4"><span className="h-5 w-5 animate-spin rounded-full border-2 border-terracotta border-t-transparent" /></div>
            ) : !providerInfo?.submission && skillLevel < 1 ? (
              <div className="py-2 text-center">
                <p className="mb-3 text-xs text-warm">
                  You haven&apos;t submitted proof of your skills yet. Add photos of your work to get Skill Verified and start appearing in Explore People.
                </p>
                <Link to="/verify-skill" className={`btn-primary inline-flex items-center gap-2 !px-6 !py-3 text-sm ${focusRing}`}>
                  Submit verification <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <>
                <dl>
                  {sub?.category ? <Row label="Category">{sub.category}</Row> : null}
                  {sub?.years_experience != null ? <Row label="Experience">{sub.years_experience} years</Row> : null}
                  {profile?.city ? <Row label="Service area">{profile.city}{profile.state ? `, ${profile.state}` : ''}</Row> : null}
                  {sub?.portfolio_paths?.length > 0 ? (
                    <Row label="Portfolio">{sub.portfolio_paths.length} photo{sub.portfolio_paths.length === 1 ? '' : 's'} submitted</Row>
                  ) : null}
                </dl>
                {skillPending ? <p className="mt-3 rounded-2xl bg-sun/20 px-3 py-2 text-xs font-semibold">Your latest submission is under review.</p> : null}
              </>
            )}
          </SectionCard>
        ) : null}

        {/* Payout details */}
        <SectionCard title="Payout details" icon={BanknotesIcon} subtitle="Where we send referral rewards."
          editing={editingBank} saving={savingBank}
          onEdit={() => setEditingBank(true)} onCancel={cancelBank} onSave={saveBank}>
          {editingBank ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="bank_name" label="Bank name" error={bankErrors.bank_name}>
                  <input value={bank.bank_name} onChange={setB('bank_name')} placeholder="e.g. Zenith Bank" className={`input ${inputClass}`} />
                </Field>
                <Field id="account_number" label="Account number" error={bankErrors.account_number}>
                  <input inputMode="numeric" value={bank.account_number} onChange={setB('account_number')} placeholder="10 digits" autoComplete="off" className={`input ${inputClass}`} />
                </Field>
              </div>
              <Field id="account_name" label="Name on account" hint="Use the name exactly as your bank shows it." error={bankErrors.account_name}>
                <input value={bank.account_name} onChange={setB('account_name')} placeholder="Name on account" autoComplete="off" className={`input ${inputClass}`} />
              </Field>
              <Field id="routing_number" label="Routing or SWIFT code" optional>
                <input value={bank.routing_number} onChange={setB('routing_number')} className={`input ${inputClass}`} />
              </Field>
            </div>
          ) : (
            <dl>
              <Row label="Bank">{profile?.bank_name}</Row>
              <Row label="Account number">{maskedAccount}</Row>
              <Row label="Name on account">{profile?.account_name}</Row>
            </dl>
          )}
          <p className="mt-4 rounded-2xl bg-cream-deep p-3 text-xs text-warm">
            Earning from deals or services? Payouts for those go to your verified payout account.{' '}
            <Link to="/payout-setup" className="font-bold text-terracotta-dark hover:underline">Set it up</Link>
          </p>
        </SectionCard>

        {/* Shortcuts */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          {quickLinks.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={tile}>
              <Icon className="h-6 w-6 flex-shrink-0 text-terracotta" aria-hidden="true" /> {label}
            </Link>
          ))}
          {!isProvider ? (
            <button type="button" onClick={handleBecomeProvider} disabled={becomingProvider} className={`${tile} text-left disabled:opacity-60`}>
              <BriefcaseIcon className="h-6 w-6 flex-shrink-0 text-terracotta" aria-hidden="true" />
              {becomingProvider ? 'Saving…' : 'Offer a service'}
            </button>
          ) : null}
        </div>

        <button type="button" onClick={handleSignOut} disabled={signingOut}
          className={`flex w-full items-center justify-center gap-2 rounded-full border-2 border-terracotta/40 bg-orange-pale/60 py-3.5 text-sm font-bold text-terracotta-dark hover:bg-orange-pale disabled:opacity-60 ${focusRing}`}>
          <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>

        <div className="mt-4"><DeleteAccountPanel /></div>
      </div>
    </div>
  )
}
