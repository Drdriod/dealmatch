import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  ArrowLeftIcon, ChevronDownIcon, EnvelopeIcon, ExclamationCircleIcon, EyeIcon, EyeSlashIcon,
  CheckCircleIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'
import { checkPhoneExists, checkUsernameExists, checkDeviceExists, checkSignupConflicts } from '@/data/signupRepository'
import { upsertProfile } from '@/data/profileRepository'
import { applyReferralCode } from '@/data/referralRepository'
import PasswordRules, { isPasswordValid } from '@/components/auth/PasswordRules'
import AuthBrandPanel from '@/components/auth/AuthBrandPanel'
import AuthField from '@/components/auth/AuthField'
import { useFormDraft } from '@/hooks/useFormDraft'
import { getDeviceFingerprint } from '@/lib/deviceFingerprint'
import { analytics } from '@/lib/posthog'
import toast from 'react-hot-toast'

// Google blocks OAuth inside embedded WebViews (403 disallowed_useragent), and
// Capacitor would bounce the flow out to the system browser, leaving the app
// signed out. Hide the Google button inside the native app shell; email/password
// and OTP sign-in still work. Re-enable once native Google Sign-In is added.
const IS_NATIVE_APP = typeof window !== 'undefined' &&
  !!window.Capacitor?.isNativePlatform?.()

// ─── Google Icon ──────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
  </svg>
)

// ─── Error message parser ─────────────────────────────────────────────────────
// Supabase's raw Auth error text is written for logs, not end users -- some
// of it (especially password-policy messages, if leaked-password protection
// or character-class requirements are enabled on the project) is a long,
// technical paragraph literally listing character sets. This is the single
// place both sign-in and sign-up route error messages through, so nothing
// raw ever reaches a toast.
function parseAuthError(message) {
  if (!message) return 'Something went wrong on our side. Please try again.'
  const m = message.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('wrong password'))
    return 'Incorrect email or password. Please try again.'
  if (m.includes('email not confirmed'))
    return 'Please confirm your email first. Check your inbox for the code.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts. Wait a moment, then try again.'
  if (m.includes('user not found') || m.includes('no user'))
    return 'We couldn\'t find an account with this email. Create an account to get started.'
  if (m.includes('known to be weak') || m.includes('easy to guess') || m.includes('pwned'))
    return 'That password has appeared in a data breach elsewhere. Choose a different one.'
  if (m.includes('password') && (m.includes('character') || m.includes('should contain') || m.includes('at least')))
    return 'Password must be at least 8 characters, with uppercase, lowercase, a number, and a symbol.'
  return message
}
// Kept as an alias -- parseSignInError was the original name before this
// was generalized to also clean up sign-up errors; avoids touching every
// call site for a rename alone.
const parseSignInError = parseAuthError

// ─── Small helpers ────────────────────────────────────────────────────────────
const EMPTY_OTP = ['', '', '', '', '', '']
const RESEND_SECONDS = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Maps a live-check status onto the icon the field shows.
const iconFor = (s) =>
  s === 'checking' ? 'checking' : (s === 'free' || s === 'valid') ? 'ok' : (s === 'taken' || s === 'invalid') ? 'bad' : null

// Soft blurred drops behind the card, the same water-drop motif as the rest of the site.
function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/15 blur-3xl" />
      <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/20 blur-3xl" />
      <div className="absolute left-1/3 top-2/3 h-48 w-48 rounded-full bg-sun/25 blur-3xl" />
    </div>
  )
}

function Alert({ children, tone = 'error' }) {
  const palette = tone === 'ok'
    ? 'border-forest/20 bg-forest-pale text-forest-dark'
    : 'border-terracotta/30 bg-orange-pale text-terracotta-dark'
  const Icon = tone === 'ok' ? CheckCircleIcon : ExclamationCircleIcon
  return (
    <div role={tone === 'ok' ? 'status' : 'alert'} className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-sm font-semibold ${palette}`}>
      <Icon className="mt-px h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function PasswordToggle({ shown, onToggle }) {
  const Icon = shown ? EyeSlashIcon : EyeIcon
  return (
    <button type="button" onClick={onToggle} aria-label={shown ? 'Hide password' : 'Show password'}
      className="rounded-full p-1 text-warm hover:text-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}

// ─── Main AuthPage ────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const refCode = params.get('ref') || sessionStorage.getItem('dm_ref') || ''
  // Keep the referral code so it survives the sign-up flow.
  if (refCode) sessionStorage.setItem('dm_ref', refCode)

  const [tab, setTab] = useState(params.get('tab') === 'signup' ? 'signup' : 'signin')
  const [showPass, setShowPass] = useState(false)
  const [pwFocus, setPwFocus] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showMore, setShowMore] = useState(Boolean(refCode))

  // Surface auth-callback errors passed via URL query param
  const urlError = params.get('error')
  const urlErrorMessages = {
    auth_callback_failed: 'Google sign-in didn\'t work. Please try again.',
    profile_creation_failed: 'Your account was created, but we couldn\'t finish setting up your profile. Sign in to continue.',
    no_session: 'Your session has expired. Sign in again to continue.',
    unexpected: 'Something went wrong on our side. Please try again.',
  }
  const callbackErrorMessage = urlError ? (urlErrorMessages[urlError] || 'We couldn\'t sign you in. Please try again.') : null

  const [form, setForm] = useState({
    fullName: '', username: '', email: '', phone: '', password: '', inviteCode: refCode,
  })

  // Live checks against the server (phone, username, referral code).
  const [fieldStatus, setFieldStatus] = useState({ email: null, phone: null, username: null, inviteCode: null })
  const [fieldErrors, setFieldErrors] = useState({ email: '', phone: '', username: '', inviteCode: '' })
  // Problems found when the person presses the button (empty or badly formed fields).
  const [submitErrors, setSubmitErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')

  const [verificationSent, setVerificationSent] = useState(false)
  const [otp, setOtp] = useState(EMPTY_OTP)
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const debounceRef = useRef({})

  // Keep what they typed (never the password) so a dropped connection or a reload
  // does not send them back to the start. Also remembers the code-entry screen.
  const draft = useFormDraft(
    'auth',
    { tab, form, verificationSent, signupEmail },
    (saved) => {
      if (saved.form) {
        setForm((f) => ({ ...f, ...saved.form, password: '', inviteCode: saved.form.inviteCode || refCode }))
        if (saved.form.username || saved.form.inviteCode) setShowMore(true)
      }
      if (saved.tab && !params.get('tab')) setTab(saved.tab)
      if (saved.verificationSent && saved.signupEmail) {
        setSignupEmail(saved.signupEmail)
        setVerificationSent(true)
      }
    },
    { omit: ['password'] },
  )

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const clearSubmitError = (k) => setSubmitErrors((e) => (e[k] ? { ...e, [k]: '' } : e))

  // Plain fields (no live check)
  const setField = useCallback((k) => (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, [k]: val }))
    setSubmitErrors((er) => (er[k] ? { ...er, [k]: '' } : er))
    setFormError('')
  }, [])

  // ─── Real-time field validation ────────────────────────────────
  const checkField = useCallback(async (field, value) => {
    if (!value || value.length < 3) {
      setFieldStatus((s) => ({ ...s, [field]: null }))
      setFieldErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    setFieldStatus((s) => ({ ...s, [field]: 'checking' }))
    try {
      let taken = false
      let errorMsg = ''

      if (field === 'email') {
        if (!EMAIL_RE.test(value)) {
          setFieldStatus((s) => ({ ...s, email: 'taken' }))
          setFieldErrors((e) => ({ ...e, email: 'Please enter a valid email address' }))
          return
        }
        // Do not query whether an email exists. That creates an anonymous
        // account-enumeration oracle. Signup handles conflicts generically.
        setFieldStatus((s) => ({ ...s, email: 'free' }))
        setFieldErrors((e) => ({ ...e, email: '' }))
        return
      }

      if (field === 'phone') {
        const clean = value.replace(/\D/g, '')
        if (clean.length < 10) {
          setFieldStatus((s) => ({ ...s, phone: 'taken' }))
          setFieldErrors((e) => ({ ...e, phone: 'Enter a valid phone number (min 10 digits)' }))
          return
        }
        const { data } = await checkPhoneExists(clean)
        taken = data === true
        errorMsg = taken ? 'This phone number is already linked to an account.' : ''
      }

      if (field === 'username') {
        const clean = value.trim().toLowerCase()
        if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
          setFieldStatus((s) => ({ ...s, username: 'taken' }))
          setFieldErrors((e) => ({ ...e, username: 'Username: 3–20 characters, letters, numbers and _ only' }))
          return
        }
        const { data } = await checkUsernameExists(clean)
        taken = data === true
        errorMsg = taken ? 'This username is already taken. Please choose another.' : ''
      }

      if (field === 'inviteCode') {
        const clean = value.trim().toLowerCase()
        // Format check before hitting the server
        if (!/^[a-z0-9]{6,12}$/.test(clean)) {
          setFieldStatus((s) => ({ ...s, inviteCode: 'invalid' }))
          setFieldErrors((e) => ({ ...e, inviteCode: 'Referral codes are 6–12 characters (letters and numbers only)' }))
          return
        }
        // Secure server-side API: rate-limited, never exposes user data
        try {
          const base = import.meta.env.VITE_APP_URL || ''
          const res = await fetch(`${base}/api/validate-invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: clean }),
          })
          const data = await res.json()
          if (res.status === 429) {
            setFieldStatus((s) => ({ ...s, inviteCode: 'invalid' }))
            setFieldErrors((e) => ({ ...e, inviteCode: data.error || 'Too many attempts. Wait a moment.' }))
            return
          }
          if (data.valid) {
            setFieldStatus((s) => ({ ...s, inviteCode: 'valid' }))
            setFieldErrors((e) => ({ ...e, inviteCode: `Referred by ${data.inviterName}` }))
          } else {
            setFieldStatus((s) => ({ ...s, inviteCode: 'invalid' }))
            setFieldErrors((e) => ({ ...e, inviteCode: data.error || 'This referral code is not valid.' }))
          }
        } catch {
          // Network error: don't block signup, just clear the field status
          setFieldStatus((s) => ({ ...s, inviteCode: null }))
        }
        return
      }

      setFieldStatus((s) => ({ ...s, [field]: taken ? 'taken' : 'free' }))
      setFieldErrors((e) => ({ ...e, [field]: errorMsg }))
    } catch {
      setFieldStatus((s) => ({ ...s, [field]: null }))
    }
  }, [])

  // Debounced change handler for the live-checked fields
  const handleFieldChange = useCallback((field) => (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, [field]: val }))
    setSubmitErrors((er) => (er[field] ? { ...er, [field]: '' } : er))
    setFormError('')
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field])
    debounceRef.current[field] = setTimeout(() => checkField(field, val), 600)
  }, [checkField])

  const handleInviteChange = (e) => {
    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    setForm((f) => ({ ...f, inviteCode: val }))
    if (val) sessionStorage.setItem('dm_ref', val)
    else sessionStorage.removeItem('dm_ref')
    if (debounceRef.current.inviteCode) clearTimeout(debounceRef.current.inviteCode)
    setFieldStatus((s) => ({ ...s, inviteCode: val.length >= 6 ? 'checking' : null }))
    setFieldErrors((er) => ({ ...er, inviteCode: '' }))
    setFormError('')
    if (val.length >= 6) {
      debounceRef.current.inviteCode = setTimeout(() => checkField('inviteCode', val), 700)
    }
  }

  const focusFirst = (ids) => {
    const id = ids.find((i) => document.getElementById(i))
    if (id) document.getElementById(id).focus()
  }

  // The message shown under a field: a problem found on submit, else the live check.
  const errorFor = (k) => submitErrors[k] || (['taken', 'invalid'].includes(fieldStatus[k]) ? fieldErrors[k] : '')

  // ─── Sign Up ────────────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault()
    setFormError('')
    const errs = {}
    if (!form.fullName.trim()) errs.fullName = 'Enter your full name'
    if (!form.email.trim()) errs.email = 'Enter your email address'
    else if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Please enter a valid email address'
    if (!form.phone.trim()) errs.phone = 'Enter your phone number'
    else if (form.phone.replace(/\D/g, '').length < 10) errs.phone = 'Enter a valid phone number (min 10 digits)'
    if (!isPasswordValid(form.password)) errs.password = 'Use at least 8 characters, with uppercase, lowercase, a number and a symbol.'
    setSubmitErrors(errs)

    const order = ['fullName', 'email', 'phone', 'password']
    const firstBad = order.find((k) => errs[k])
    if (firstBad) return focusFirst([`su-${firstBad}`])

    if (['taken'].includes(fieldStatus.phone)) return focusFirst(['su-phone'])
    if (fieldStatus.email === 'taken') return focusFirst(['su-email'])
    if (fieldStatus.username === 'taken') { setShowMore(true); return focusFirst(['su-username']) }
    if (fieldStatus.inviteCode === 'invalid') { setShowMore(true); return focusFirst(['su-invite']) }
    if (Object.values(fieldStatus).includes('checking')) {
      return setFormError('Still checking your details. Give it a second, then try again.')
    }
    // A code was typed but never validated (e.g. restored from the saved draft): validate it now.
    if (form.inviteCode.trim() && fieldStatus.inviteCode === null) {
      checkField('inviteCode', form.inviteCode.trim())
      return setFormError('Checking your referral code. Give it a second, then try again.')
    }

    setLoading(true)
    try {
      const cleanPhone = form.phone.replace(/\D/g, '')
      const cleanUsername = form.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')

      // One-account-per-person check: same device already registered?
      const fingerprint = await getDeviceFingerprint()
      if (fingerprint) {
        const { data: deviceCheck } = await checkDeviceExists(fingerprint)
        if (deviceCheck?.[0]?.exists_count > 0) {
          setFormError('An account already exists on this device. Sign in instead, or contact support if you think this is a mistake.')
          return
        }
      }

      const { data: conflicts, error: rpcErr } = await checkSignupConflicts({
        email: form.email.trim().toLowerCase(),
        phone: cleanPhone || null,
        username: cleanUsername || null,
      })

      if (!rpcErr && conflicts) {
        // Deliberately do not expose conflicts.email_taken. The caller must
        // receive the same general signup outcome for known and unknown email.
        if (conflicts.phone_taken) {
          setFieldStatus((s) => ({ ...s, phone: 'taken' }))
          setFieldErrors((er) => ({ ...er, phone: 'This phone number is already linked to an account.' }))
          return focusFirst(['su-phone'])
        }
        if (conflicts.username_taken) {
          setShowMore(true)
          setFieldStatus((s) => ({ ...s, username: 'taken' }))
          setFieldErrors((er) => ({ ...er, username: 'This username is already taken.' }))
          return focusFirst(['su-username'])
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: form.fullName.trim(),
            phone: cleanPhone,
          },
        },
      })

      if (error) {
        // Keep registration outcomes generic so existing accounts cannot be
        // distinguished by response text.
        setFormError('We couldn\'t create your account. Check your details, or try signing in.')
        return
      }

      if (data?.user) {
        await upsertProfile({
          id: data.user.id,
          full_name: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: cleanPhone || null,
          username: cleanUsername || null,
          device_fingerprint: fingerprint || null,
        })
      }

      analytics?.signedUp?.('email')
      setSignupEmail(form.email.trim().toLowerCase())
      setVerificationSent(true)
      setOtp(EMPTY_OTP)
      setOtpError('')
      setCooldown(RESEND_SECONDS)
      toast.success('Account created. Check your email for the 6-digit code.')
    } catch (err) {
      console.error('Signup error:', err)
      setFormError(parseAuthError(err.message) || 'We couldn\'t create your account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Links this new account to the referral code they entered. Never blocks sign-up:
  // the server decides (new account, no referrer yet, valid code) and a refusal is silent.
  const linkReferral = async () => {
    const code = (sessionStorage.getItem('dm_ref') || '').trim()
    if (!code) return
    try { await applyReferralCode(code) } catch { /* ignore */ }
    sessionStorage.removeItem('dm_ref')
  }

  // ─── OTP ────────────────────────────────────────────────────────
  const verifyCode = async (code) => {
    if (verifying) return
    if (code.length < 6) return setOtpError('Enter all 6 digits of the code.')
    setOtpError('')
    setVerifying(true)
    const { error } = await supabase.auth.verifyOtp({ email: signupEmail, token: code, type: 'email' })
    setVerifying(false)
    if (error) {
      setOtp(EMPTY_OTP)
      document.getElementById('otp-0')?.focus()
      return setOtpError('That code is incorrect or has expired. Check it, or resend a new code.')
    }
    await linkReferral()
    draft.clear()
    toast.success('Email confirmed. Welcome to DealMatch.')
    navigate('/onboarding', { replace: true })
  }

  const handleOtpChange = (i, val) => {
    if (!/^\d*$/.test(val)) return
    const n = [...otp]
    n[i] = val.slice(-1)
    setOtp(n)
    setOtpError('')
    if (val && i < 5) document.getElementById(`otp-${i + 1}`)?.focus()
    if (n.every(Boolean)) verifyCode(n.join(''))
  }
  const handleOtpKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) document.getElementById(`otp-${i - 1}`)?.focus()
  }
  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const n = [...EMPTY_OTP]
    pasted.split('').forEach((d, i) => { n[i] = d })
    setOtp(n)
    setOtpError('')
    document.getElementById(`otp-${Math.min(pasted.length, 5)}`)?.focus()
    if (pasted.length === 6) verifyCode(pasted)
  }
  const handleResendOtp = async () => {
    if (cooldown > 0) return
    const { error } = await supabase.auth.resend({ type: 'signup', email: signupEmail })
    if (error) return setOtpError(parseAuthError(error.message))
    toast.success('New code sent to ' + signupEmail)
    setOtp(EMPTY_OTP)
    setOtpError('')
    setCooldown(RESEND_SECONDS)
    document.getElementById('otp-0')?.focus()
  }

  // ─── Sign In ────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormNotice('')
    const errs = {}
    if (!form.email.trim()) errs.email = 'Enter your email address'
    if (!form.password) errs.password = 'Enter your password'
    setSubmitErrors(errs)
    if (errs.email || errs.password) return focusFirst([errs.email ? 'si-email' : 'si-password'])

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    })
    setLoading(false)
    if (error) return setFormError(parseSignInError(error.message))
    analytics?.signedIn?.()
    draft.clear()
    // replace:true clears error params and prevents back-navigation to the login form
    navigate('/browse', { replace: true })
  }

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setFormError(parseAuthError(error.message))
  }

  const handleForgotPassword = async () => {
    setFormError('')
    setFormNotice('')
    if (!form.email.trim()) {
      setSubmitErrors((er) => ({ ...er, email: 'Enter your email first, then tap "Forgot password?"' }))
      return focusFirst(['si-email'])
    }
    const { error } = await supabase.auth.resetPasswordForEmail(
      form.email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/reset-password` },
    )
    if (error) return setFormError(parseAuthError(error.message))
    setFormNotice('If that email is registered, we\'ve sent reset instructions to ' + form.email.trim())
  }

  const switchTab = (t) => {
    setTab(t)
    setFieldStatus({ email: null, phone: null, username: null, inviteCode: null })
    setFieldErrors({ email: '', phone: '', username: '', inviteCode: '' })
    setSubmitErrors({})
    setFormError('')
    setFormNotice('')
  }

  const checking = Object.values(fieldStatus).includes('checking')

  // ─── Code-entry screen ──────────────────────────────────────────
  if (verificationSent) {
    return (
      <div className="relative flex min-h-svh flex-col items-center bg-cream px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-10 sm:justify-center">
        <Backdrop />
        <div className="relative w-full max-w-sm rounded-[40px_40px_40px_12px] border border-white/70 bg-white/80 p-7 text-center shadow-soft backdrop-blur-xl sm:p-9">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px_22px_22px_8px] bg-orange-pale text-terracotta">
            <EnvelopeIcon className="h-8 w-8" aria-hidden="true" />
          </span>
          <h1 className="mb-2 font-display text-3xl text-deep">Check your email</h1>
          <p className="text-sm text-warm">We sent a 6-digit code to</p>
          <p className="mb-6 break-all text-sm font-bold text-terracotta-dark">{signupEmail}</p>

          <div role="group" aria-label="6-digit confirmation code" className="mb-4 flex justify-center gap-2 sm:gap-2.5" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1}
                aria-label={`Digit ${i + 1} of 6`}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                value={digit}
                disabled={verifying}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className={`h-14 w-11 rounded-2xl border-2 text-center text-xl font-black outline-none transition-colors focus:border-terracotta focus:bg-white sm:w-12 ${
                  otpError ? 'border-terracotta bg-orange-pale text-terracotta-dark'
                    : digit ? 'border-terracotta bg-orange-pale text-terracotta-dark' : 'border-line bg-cream text-deep'
                }`}
              />
            ))}
          </div>

          {otpError ? <div className="mb-4 text-left"><Alert>{otpError}</Alert></div> : null}

          <button type="button" onClick={() => verifyCode(otp.join(''))} disabled={verifying}
            className="btn-primary mb-4 w-full !py-3.5 text-[15px]">
            {verifying ? 'Confirming…' : 'Confirm email'}
          </button>

          <p className="text-sm text-warm">
            Didn&apos;t get it?{' '}
            {cooldown > 0 ? (
              <span className="font-semibold text-deep">Resend in {cooldown}s</span>
            ) : (
              <button type="button" onClick={handleResendOtp} className="font-bold text-terracotta-dark hover:underline">Resend code</button>
            )}
          </p>
          <p className="mt-1 text-xs text-warm">Check your spam folder too.</p>

          <button type="button" onClick={() => { setVerificationSent(false); setOtp(EMPTY_OTP); setOtpError('') }}
            className="mx-auto mt-6 flex items-center gap-1.5 text-sm font-semibold text-warm hover:text-deep">
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Change my details
          </button>
        </div>
      </div>
    )
  }

  // ─── Main ───────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-cream p-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:p-10">
      <Backdrop />
      <div className="relative w-full max-w-sm md:max-w-4xl">
        <div className="grid rounded-[40px_40px_40px_12px] border border-white/70 bg-white/80 shadow-soft backdrop-blur-xl md:grid-cols-2">
          <div className="p-6 sm:p-8">
            <Link to="/" className="mb-5 flex items-center gap-2 font-display text-xl text-deep md:hidden">
              <img src="/brand/dealmatch-icon-transparent.png" alt="" className="h-7 w-auto" />
              <span>Deal<span className="text-terracotta">Match</span></span>
            </Link>

            <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-warm hover:text-deep">
              <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Back to home
            </Link>

            {callbackErrorMessage ? <div className="mb-5"><Alert>{callbackErrorMessage}</Alert></div> : null}

            {/* Tabs */}
            <div role="tablist" aria-label="Sign in or create an account" className="mb-6 flex rounded-full bg-cream-deep p-1">
              {[['signin', 'Sign In'], ['signup', 'Create Account']].map(([t, l]) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t}
                  onClick={() => switchTab(t)}
                  className={`flex-1 rounded-full py-2.5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                    tab === t ? 'bg-white text-deep shadow-card' : 'text-warm hover:text-deep'
                  }`}>{l}</button>
              ))}
            </div>

            {draft.restored && !formError ? (
              <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-[20px_20px_20px_6px] border border-forest/20 bg-forest-pale px-4 py-3 text-sm font-semibold text-forest-dark">
                <span>We kept what you had typed. For your safety, re-enter your password.</span>
                <button type="button" onClick={draft.dismiss} aria-label="Dismiss" className="flex-shrink-0 rounded-full p-0.5 hover:bg-white/70">
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            {/* Google (web only -- see IS_NATIVE_APP above) */}
            {!IS_NATIVE_APP && (
              <>
                <button onClick={handleGoogle} type="button"
                  className="mb-5 flex w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-4 py-3 text-[15px] font-bold text-deep transition-colors hover:border-deep/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
                  <GoogleIcon /> Continue with Google
                </button>
                <div className="relative mb-5 flex items-center gap-3 text-xs font-semibold text-warm" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />
                  or with email
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            {tab === 'signup' ? (
              /* ── Sign Up ── */
              <form onSubmit={handleSignUp} noValidate className="space-y-4">
                <div>
                  <h1 className="mb-1 font-display text-3xl leading-tight text-deep">Your next deal starts here.</h1>
                  <p className="text-sm text-warm">Create an account to discover opportunities, manage your offers and keep track of your transactions.</p>
                </div>

                <AuthField id="su-fullName" label="Full name" placeholder="e.g. John Doe"
                  value={form.fullName} onChange={setField('fullName')}
                  autoComplete="name" autoCapitalize="words" error={submitErrors.fullName} />

                <AuthField id="su-email" label="Email address" type="email" placeholder="your@email.com"
                  hint="We'll send a 6-digit confirmation code to this email."
                  value={form.email} onChange={handleFieldChange('email')}
                  autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  status={iconFor(fieldStatus.email)} error={errorFor('email')} />

                <AuthField id="su-phone" label="Phone number" type="tel" placeholder="e.g. 08012345678"
                  hint="Used for WhatsApp contact and account recovery."
                  value={form.phone} onChange={handleFieldChange('phone')}
                  autoComplete="tel" inputMode="tel"
                  status={iconFor(fieldStatus.phone)} error={errorFor('phone')}
                  success={fieldStatus.phone === 'free' ? 'Available' : undefined} />

                {/* Password. The rules open as an animated popup while the field has focus. */}
                <div className="relative"
                  onFocus={() => setPwFocus(true)}
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPwFocus(false) }}>
                  <AuthField id="su-password" label="Password" placeholder="Create a password"
                    type={showPass ? 'text' : 'password'}
                    value={form.password} onChange={setField('password')}
                    autoComplete="new-password" error={submitErrors.password}
                    trailing={<PasswordToggle shown={showPass} onToggle={() => setShowPass((v) => !v)} />} />
                  <PasswordRules id="password-rules" password={form.password} open={pwFocus} />
                </div>

                {/* Optional extras stay out of the way until wanted */}
                <div>
                  <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}
                    className="flex items-center gap-1.5 text-sm font-bold text-forest hover:text-forest-dark">
                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} aria-hidden="true" />
                    Username or referral code (optional)
                  </button>
                  {showMore ? (
                    <div className="mt-3 space-y-4 rounded-[24px_24px_24px_8px] border border-line bg-cream/70 p-4">
                      <AuthField id="su-username" label="Username" optional placeholder="e.g. john_doe"
                        hint="3–20 characters: letters, numbers and underscore."
                        value={form.username} onChange={handleFieldChange('username')}
                        autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                        status={iconFor(fieldStatus.username)} error={errorFor('username')}
                        success={fieldStatus.username === 'free' ? 'Available' : undefined} />
                      <AuthField id="su-invite" label="Referral code" optional placeholder="e.g. a3f8bc12"
                        hint="Did someone refer you? Enter their code."
                        name="referral_code" maxLength={12}
                        value={form.inviteCode} onChange={handleInviteChange}
                        autoComplete="off" spellCheck={false}
                        status={iconFor(fieldStatus.inviteCode)}
                        error={fieldStatus.inviteCode === 'invalid' ? fieldErrors.inviteCode : ''}
                        success={fieldStatus.inviteCode === 'valid' ? fieldErrors.inviteCode : undefined} />
                    </div>
                  ) : null}
                </div>

                {formError ? <Alert>{formError}</Alert> : null}

                <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-[15px]">
                  {loading ? 'Creating account…' : checking ? 'Checking availability…' : 'Create Account'}
                </button>
              </form>
            ) : (
              /* ── Sign In ── */
              <form onSubmit={handleSignIn} noValidate className="space-y-4">
                <div>
                  <h1 className="mb-1 font-display text-3xl leading-tight text-deep">Welcome back.</h1>
                  <p className="text-sm text-warm">Sign in to continue where you left off.</p>
                </div>

                <AuthField id="si-email" label="Email" type="email" placeholder="your@email.com"
                  value={form.email} onChange={setField('email')}
                  autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  error={submitErrors.email} />

                <AuthField id="si-password" label="Password" placeholder="Your password"
                  type={showPass ? 'text' : 'password'}
                  value={form.password} onChange={setField('password')}
                  autoComplete="current-password" error={submitErrors.password}
                  labelAside={
                    <button type="button" onClick={handleForgotPassword}
                      className="text-xs font-bold text-terracotta-dark hover:underline">Forgot password?</button>
                  }
                  trailing={<PasswordToggle shown={showPass} onToggle={() => setShowPass((v) => !v)} />} />

                {formError ? <Alert>{formError}</Alert> : null}
                {formNotice ? <Alert tone="ok">{formNotice}</Alert> : null}

                <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-[15px]">
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            )}
          </div>

          <AuthBrandPanel />
        </div>

        <p className="mt-5 px-4 text-center text-xs text-deep/70">
          By continuing you agree to our{' '}
          <Link to="/terms" className="font-semibold text-terracotta-dark hover:underline">Terms</Link>
          {' '}and{' '}
          <Link to="/privacy" className="font-semibold text-terracotta-dark hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}
