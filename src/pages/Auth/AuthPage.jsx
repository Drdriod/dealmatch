import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle, Eye, EyeOff, Loader, Store, X, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { checkPhoneExists, checkUsernameExists, checkDeviceExists, checkSignupConflicts } from '@/data/signupRepository'
import { upsertProfile } from '@/data/profileRepository'
import { getDeviceFingerprint } from '@/lib/deviceFingerprint'
import { analytics } from '@/lib/posthog'
import toast from 'react-hot-toast'
import clsx from 'clsx'

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

// ─── FieldStatus indicator ────────────────────────────────────────────────────
// FIX: Defined OUTSIDE AuthPage so React never treats it as a new component
// type between renders. Defining it inside caused React to unmount + remount
// the input on every keystroke, dismissing the Android keyboard immediately.
function FieldStatus({ status }) {
  if (status === 'checking') return <Loader size={14} className="animate-spin" style={{ color:'#647068' }} />
  if (status === 'taken')    return <XCircle size={14} style={{ color:'#C85F2D' }} />
  if (status === 'free')     return <CheckCircle size={14} style={{ color:'#7A9E7E' }} />
  return null
}

// ─── Field component ──────────────────────────────────────────────────────────
// FIX: Also moved OUTSIDE AuthPage for the same reason.
// When Field was defined inside AuthPage, every parent render created a brand
// new function reference for Field, causing React to unmount the old Field
// instance and mount a fresh one - destroying focus and dismissing the keyboard.
// Moving it outside means React recognises it as the same stable component
// across renders and simply updates its props instead of remounting.
function Field({
  label, fieldKey, type = 'text', placeholder,
  required = false, hint = '',
  value, onChange, status, error,
}) {
  const borderColor = error ? '#C85F2D' : status === 'free' ? '#7A9E7E' : '#DEDDD6'
  return (
    <div>
      <label
        className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
        style={{ color:'rgba(23,33,27,0.5)' }}>
        {label}{required && <span style={{ color:'#C85F2D' }}> *</span>}
      </label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'off'}
          // Prevent autocomplete dropdowns from triggering re-renders that
          // dismiss the keyboard on Android Chrome
          autoCorrect="off"
          autoCapitalize={type === 'email' ? 'none' : 'words'}
          spellCheck={false}
          className="input w-full pr-9"
          style={{ borderColor, backgroundColor:'#FFFFFF', color:'#17211B' }}
        />
        {status && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <FieldStatus status={status} />
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color:'#C85F2D' }}>
          <XCircle size={11} /> {error}
        </p>
      )}
      {!error && status === 'free' && (
        <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color:'#7A9E7E' }}>
          <CheckCircle size={11} /> Available
        </p>
      )}
      {hint && !error && status !== 'free' && (
        <p className="text-xs mt-1" style={{ color:'#647068' }}>{hint}</p>
      )}
    </div>
  )
}

// ─── Error message parser ─────────────────────────────────────────────────────
// Supabase's raw Auth error text is written for logs, not end users -- some
// of it (especially password-policy messages, if leaked-password protection
// or character-class requirements are enabled on the project) is a long,
// technical paragraph literally listing character sets. This is the single
// place both sign-in and sign-up route error messages through, so nothing
// raw ever reaches a toast.
function parseAuthError(message) {
  if (!message) return 'Something went wrong. Please try again.'
  const m = message.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('wrong password'))
    return 'Incorrect email or password. Please try again.'
  if (m.includes('email not confirmed'))
    return 'Please confirm your email first. Check your inbox.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts. Please wait a moment and try again.'
  if (m.includes('user not found') || m.includes('no user'))
    return 'No account found with this email. Please sign up.'
  if (m.includes('known to be weak') || m.includes('easy to guess') || m.includes('pwned'))
    return 'That password has appeared in a data breach elsewhere. Please choose a different one.'
  if (m.includes('password') && (m.includes('character') || m.includes('should contain') || m.includes('at least')))
    return 'Password must be at least 8 characters, with uppercase, lowercase, a number, and a symbol.'
  return message
}
// Kept as an alias -- parseSignInError was the original name before this
// was generalized to also clean up sign-up errors; avoids touching every
// call site for a rename alone.
const parseSignInError = parseAuthError

// ─── Password requirements ─────────────────────────────────────────────────────
// Single source of truth for both the live checklist under the signup
// field and the pre-submit validation -- so the two can never silently
// drift out of sync with each other again.
const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters',        test: (p) => p.length >= 8 },
  { id: 'upper',  label: 'One uppercase letter (A-Z)',    test: (p) => /[A-Z]/.test(p) },
  { id: 'lower',  label: 'One lowercase letter (a-z)',    test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number (0-9)',              test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'One symbol (e.g. ! @ # $ %)',   test: (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?~`]/.test(p) },
]
const isPasswordValid = (password) => PASSWORD_RULES.every(r => r.test(password || ''))

function PasswordChecklist({ password }) {
  return (
    <div className="mt-2 grid grid-cols-1 gap-1">
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password || '')
        return (
          <div key={rule.id} className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: met ? '#5C8060' : 'rgba(23,33,27,0.4)' }}>
            {met ? <Check size={12} strokeWidth={3} /> : <span style={{ width:12, height:12, borderRadius:'50%', border:'1.5px solid currentColor', display:'inline-block', flexShrink:0 }} />}
            {rule.label}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main AuthPage ────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get('ref') || sessionStorage.getItem('dm_ref') || ''
  // Store ref code in sessionStorage so it survives the signup flow
  if (refCode) sessionStorage.setItem('dm_ref', refCode)

  const [params]  = useSearchParams()
  const navigate  = useNavigate()
  const [tab, setTab] = useState(params.get('tab') === 'signup' ? 'signup' : 'signin')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)

  // Surface auth-callback errors passed via URL query param
  const urlError = params.get('error')
  const urlErrorMessages = {
    auth_callback_failed: 'Sign-in via Google failed. Please try again.',
    profile_creation_failed: 'Account created but profile setup failed. Please sign in.',
    no_session: 'Your session expired. Please sign in again.',
    unexpected: 'An unexpected error occurred. Please try again.',
  }
  const callbackErrorMessage = urlError ? (urlErrorMessages[urlError] || 'Authentication failed. Please try again.') : null

  const [form, setForm] = useState({
    fullName: '', username: '', email: '', phone: '', password: '', inviteCode: refCode
  })

  const [fieldStatus, setFieldStatus] = useState({ email: null, phone: null, username: null, inviteCode: null })
  const [fieldErrors, setFieldErrors] = useState({ email: '', phone: '', username: '', inviteCode: '' })

  const [verificationSent, setVerificationSent] = useState(false)
  const [otp,       setOtp]       = useState(['','','','','',''])
  const [verifying, setVerifying] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')

  const debounceRef = useRef({})

  // Stable setters - these don't change between renders so passing them
  // as props to Field does not cause Field to remount
  const setField = useCallback((k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
  }, [])

  // ─── Real-time field validation ────────────────────────────────
  const checkField = useCallback(async (field, value) => {
    if (!value || value.length < 3) {
      setFieldStatus(s => ({ ...s, [field]: null }))
      setFieldErrors(e => ({ ...e, [field]: '' }))
      return
    }
    setFieldStatus(s => ({ ...s, [field]: 'checking' }))
    try {
      let taken = false
      let errorMsg = ''

      if (field === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          setFieldStatus(s => ({ ...s, email: 'taken' }))
          setFieldErrors(e => ({ ...e, email: 'Please enter a valid email address' }))
          return
        }
        // Do not query whether an email exists. That creates an anonymous
        // account-enumeration oracle. Signup handles conflicts generically.
        setFieldStatus(s => ({ ...s, email: 'free' }))
        setFieldErrors(e => ({ ...e, email: '' }))
        return
      }

      if (field === 'phone') {
        const clean = value.replace(/\D/g, '')
        if (clean.length < 10) {
          setFieldStatus(s => ({ ...s, phone: 'taken' }))
          setFieldErrors(e => ({ ...e, phone: 'Enter a valid phone number (min 10 digits)' }))
          return
        }
        const { data } = await checkPhoneExists(clean)
        taken = data === true
        errorMsg = taken ? 'This phone number is already linked to an account.' : ''
      }

      if (field === 'username') {
        const clean = value.trim().toLowerCase()
        if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
          setFieldStatus(s => ({ ...s, username: 'taken' }))
          setFieldErrors(e => ({ ...e, username: 'Username: 3–20 characters, letters, numbers and _ only' }))
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
          setFieldStatus(s => ({ ...s, inviteCode: 'invalid' }))
          setFieldErrors(e => ({ ...e, inviteCode: 'Invite codes are 6–12 characters (letters and numbers only)' }))
          return
        }
        // Use secure server-side API - rate-limited, never exposes user data
        try {
          const base = import.meta.env.VITE_APP_URL || ''
          const res = await fetch(`${base}/api/validate-invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: clean }),
          })
          const data = await res.json()
          if (res.status === 429) {
            setFieldStatus(s => ({ ...s, inviteCode: 'invalid' }))
            setFieldErrors(e => ({ ...e, inviteCode: data.error || 'Too many attempts. Wait a moment.' }))
            return
          }
          if (data.valid) {
            setFieldStatus(s => ({ ...s, inviteCode: 'valid' }))
            setFieldErrors(e => ({ ...e, inviteCode: `Invited by ${data.inviterName}` }))
          } else {
            setFieldStatus(s => ({ ...s, inviteCode: 'invalid' }))
            setFieldErrors(e => ({ ...e, inviteCode: data.error || 'This invite code is not valid.' }))
          }
        } catch {
          // Network error - don't block signup, just clear the field status
          setFieldStatus(s => ({ ...s, inviteCode: null }))
        }
        return
      }

      setFieldStatus(s => ({ ...s, [field]: taken ? 'taken' : 'free' }))
      setFieldErrors(e => ({ ...e, [field]: errorMsg }))
    } catch {
      setFieldStatus(s => ({ ...s, [field]: null }))
    }
  }, [])

  // Debounced field change handler - stable reference via useCallback
  const handleFieldChange = useCallback((field) => (e) => {
    const val = e.target.value
    setForm(f => ({ ...f, [field]: val }))
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field])
    debounceRef.current[field] = setTimeout(() => checkField(field, val), 600)
  }, [checkField])

  // ─── Sign Up ────────────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault()
    if (!form.fullName.trim())    return toast.error('Please enter your full name')
    if (!form.email.trim())       return toast.error('Please enter your email')
    if (!form.phone.trim())       return toast.error('Please enter your phone number')
    if (!isPasswordValid(form.password)) return toast.error('Password must be at least 8 characters, with uppercase, lowercase, a number, and a symbol.')

    if (fieldStatus.email      === 'taken')   return toast.error('This email is already registered. Please sign in.')
    if (fieldStatus.phone      === 'taken')   return toast.error('This phone number is already linked to an account.')
    if (fieldStatus.username   === 'taken')   return toast.error('This username is already taken. Choose another.')
    if (fieldStatus.inviteCode === 'invalid') return toast.error('The invite code you entered is not valid.')
    if (fieldStatus.inviteCode === 'checking') return toast.error('Please wait - verifying invite code...')
    if (Object.values(fieldStatus).includes('checking')) return toast.error('Please wait - still checking your details...')
    // If user typed a code but it shows as null (never validated), validate it now
    if (form.inviteCode.trim() && fieldStatus.inviteCode === null) {
      toast.error('Please wait for the invite code to be verified.')
      checkField('inviteCode', form.inviteCode.trim())
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const cleanPhone    = form.phone.replace(/\D/g, '')
      const cleanUsername = form.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')

      // One-account-per-person check: same device already registered?
      const fingerprint = await getDeviceFingerprint()
      if (fingerprint) {
        const { data: deviceCheck } = await checkDeviceExists(fingerprint)
        if (deviceCheck?.[0]?.exists_count > 0) {
          toast.error('An account already exists on this device. Please sign in instead, or contact support if this is an error.')
          setLoading(false)
          return
        }
      }

      const { data: conflicts, error: rpcErr } = await checkSignupConflicts({
        email:    form.email.trim().toLowerCase(),
        phone:    cleanPhone    || null,
        username: cleanUsername || null,
      })

      if (!rpcErr && conflicts) {
        // Deliberately do not expose conflicts.email_taken. The caller must
        // receive the same general signup outcome for known and unknown email.
        if (conflicts.phone_taken) {
          setFieldStatus(s => ({ ...s, phone: 'taken' }))
          setFieldErrors(e => ({ ...e, phone: 'This phone number is already linked to an account.' }))
          toast.error('This phone number is already linked to an account.')
          return
        }
        if (conflicts.username_taken) {
          setFieldStatus(s => ({ ...s, username: 'taken' }))
          setFieldErrors(e => ({ ...e, username: 'This username is already taken.' }))
          toast.error('This username is already taken. Choose another.')
          return
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email:    form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name:   form.fullName.trim(),
            phone:       cleanPhone,
          }
        },
      })

      if (error) {
        // Keep registration outcomes generic so existing accounts cannot be
        // distinguished by response text.
        toast.error('We could not create the account. Please check your details or try signing in.')
        return
      }

      if (data?.user) {
        await upsertProfile({
          id:                  data.user.id,
          full_name:           form.fullName.trim(),
          email:               form.email.trim().toLowerCase(),
          phone:               cleanPhone || null,
          username:            cleanUsername || null,
          device_fingerprint:  fingerprint || null,
        })
      }

      analytics?.signedUp?.('email')
      setSignupEmail(form.email.trim().toLowerCase())
      setVerificationSent(true)
      setOtp(['','','','','',''])
      toast.success('Account created! Check your email for the 6-digit code.')

    } catch (err) {
      console.error('Signup error:', err)
      toast.error(parseAuthError(err.message) || 'Sign up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── OTP ────────────────────────────────────────────────────────
  const handleOtpChange = (i, val) => {
    if (!/^\d*$/.test(val)) return
    const n = [...otp]; n[i] = val.slice(-1); setOtp(n)
    if (val && i < 5) document.getElementById(`otp-${i+1}`)?.focus()
  }
  const handleOtpKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) document.getElementById(`otp-${i-1}`)?.focus()
  }
  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6)
    const n = [...otp]; pasted.split('').forEach((d,i) => { n[i]=d }); setOtp(n)
    document.getElementById(`otp-${Math.min(pasted.length,5)}`)?.focus()
  }
  const handleVerifyOtp = async () => {
    const code = otp.join('')
    if (code.length < 6) return toast.error('Enter the complete 6-digit code')
    setVerifying(true)
    const { error } = await supabase.auth.verifyOtp({ email: signupEmail, token: code, type: 'email' })
    setVerifying(false)
    if (error) return toast.error('Invalid or expired code. Try resending.')
    toast.success('Email confirmed! Welcome to DealMatch')
    navigate('/onboarding', { replace: true })
  }
  const handleResendOtp = async () => {
    const { error } = await supabase.auth.resend({ type:'signup', email: signupEmail })
    if (error) return toast.error(parseAuthError(error.message))
    toast.success('New code sent to ' + signupEmail)
    setOtp(['','','','','',''])
  }

  // ─── Sign In ────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) return toast.error('Please fill in all fields')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email:    form.email.trim().toLowerCase(),
      password: form.password,
    })
    setLoading(false)
    if (error) return toast.error(parseSignInError(error.message))
    analytics?.signedIn?.()
    // replace:true clears error params and prevents back-navigation to the login form
    navigate('/browse', { replace: true })
  }

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) toast.error(parseAuthError(error.message))
  }

  const handleForgotPassword = async () => {
    if (!form.email) return toast.error('Enter your email address first')
    const { error } = await supabase.auth.resetPasswordForEmail(
      form.email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/reset-password` }
    )
    if (error) return toast.error(error.message)
    toast.success('Password reset link sent to ' + form.email)
  }

  const resetTabState = () => {
    setFieldStatus({ email: null, phone: null, username: null })
    setFieldErrors({ email: '', phone: '', username: '' })
  }

  // ─── OTP Screen ─────────────────────────────────────────────────
  if (verificationSent) {
    return (
      <div style={{ backgroundColor:'#FAF3EA' }} className="min-h-screen flex flex-col items-center px-6 pt-10 pb-12 sm:justify-center sm:pt-12">
        <div className="w-full max-w-sm text-center rounded-3xl p-8 sm:p-9"
          style={{ backgroundColor:'#FFFFFF', boxShadow:'0 12px 40px rgba(23,33,27,0.08)', border:'1px solid #F0E5D8' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor:'rgba(200,95,45,0.1)' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#C85F2D" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-black mb-2" style={{ color:'#17211B' }}>Check your email</h1>
          <p className="text-sm mb-1" style={{ color:'#647068' }}>We sent a 6-digit code to</p>
          <p className="font-semibold text-sm mb-8" style={{ color:'#C85F2D' }}>{signupEmail}</p>
          <div className="flex gap-2.5 sm:gap-3 justify-center mb-8" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1}
                value={digit}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                style={{
                  backgroundColor: digit ? 'rgba(200,95,45,0.06)' : '#F7F4ED',
                  borderColor: digit ? '#C85F2D' : '#DEDDD6',
                  color: digit ? '#C85F2D' : '#17211B'
                }}
                className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-black rounded-2xl border-2 outline-none transition-all focus:border-[#C85F2D]"
              />
            ))}
          </div>
          <button onClick={handleVerifyOtp} disabled={verifying || otp.join('').length < 6}
            className="w-full py-4 rounded-2xl font-bold text-white mb-4 transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor:'#C85F2D', boxShadow:'0 4px 16px rgba(200,95,45,0.3)' }}>
            {verifying ? 'Verifying...' : 'Confirm Email'}
          </button>
          <p style={{ color:'#647068' }} className="text-sm">
            Didn't receive it?{' '}
            <button onClick={handleResendOtp} style={{ color:'#C85F2D' }}
              className="font-semibold hover:underline">Resend code</button>
          </p>
          <button onClick={() => { setVerificationSent(false); setOtp(['','','','','','']) }}
            className="mt-6 flex items-center gap-2 text-sm mx-auto" style={{ color:'#647068' }}>
            <ArrowLeft size={14} /> Back to signup
          </button>
        </div>
      </div>
    )
  }

  // ─── Main ───────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor:'#FAF3EA' }} className="min-h-screen flex">
      {/* Left panel - desktop only. Real photography instead of a flat
          gradient-on-navy block, reusing the same brand photos as the
          homepage hero so this feels like the same product, not a
          generic auth template bolted on afterward. */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 relative overflow-hidden">
        <img src="/home/hero-place-house.webp" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ backgroundColor:'rgba(15,11,9,0.72)' }} />
        <div className="absolute inset-0"
          style={{ background:'radial-gradient(ellipse 80% 60% at 30% 60%, rgba(200,95,45,0.25) 0%, transparent 60%)' }} />
        <Link to="/" className="flex items-center gap-2.5 font-display text-2xl font-black text-white relative z-10">
          <img src="/brand/dealmatch-icon-transparent.png" alt="" className="h-8 w-auto" />
          Deal<span style={{ color:'#C96A3A' }}>Match</span>
        </Link>
        <div className="relative z-10">
          <p className="font-display text-5xl font-black text-white leading-tight mb-6">
            Find a <em style={{ color:'#C85F2D' }}>verified place</em><br />or a <em style={{ color:'#C85F2D' }}>verified person.</em><br />Pay for protection first.
          </p>
          {[
            'Places: ID plus proof of property, checked before anything goes live',
            'Skilled People: ID plus proof of work - artisans, tutors, daily services',
            'Your money stays protected until you confirm the deal',
          ].map(text => (
            <div key={text} className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor:'rgba(255,255,255,0.12)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-sm" style={{ color:'rgba(255,255,255,0.7)' }}>{text}</p>
            </div>
          ))}
        </div>
        <p className="text-xs relative z-10" style={{ color:'rgba(255,255,255,0.35)' }}>
          © {new Date().getFullYear()} DealMatch. All rights reserved.
        </p>
      </div>

      {/* Right panel - top-aligned on mobile (a form this long shouldn't
          vertically center: on a phone screen that pushes the entire
          card into empty space above and below it, which is what made
          this look broken rather than deliberate). Only centers once
          there's a matching visual on a wide desktop screen. */}
      <div className="flex-1 flex flex-col items-center px-5 sm:px-6 pt-8 pb-10 lg:justify-center lg:pt-12 lg:pb-12 overflow-y-auto">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-5 font-display text-xl font-black" style={{ color:'#1A1210' }}>
            <img src="/brand/dealmatch-icon-transparent.png" alt="" className="h-7 w-auto" />
            Deal<span style={{ color:'#C96A3A' }}>Match</span>
          </Link>

          {/* Elevated card instead of the form floating directly on the
              page background - one clear surface, softly lifted. */}
          <div className="rounded-3xl p-6 sm:p-8"
            style={{ backgroundColor:'#FFFFFF', boxShadow:'0 12px 40px rgba(23,33,27,0.07)', border:'1px solid #F0E5D8' }}>

            <Link to="/" className="hidden lg:inline-flex items-center gap-2 text-sm mb-6 transition-colors"
              style={{ color:'rgba(23,33,27,0.4)' }}>
              <ArrowLeft size={14} /> Back to home
            </Link>

            {/* Auth callback error banner */}
            {callbackErrorMessage && (
              <div
                className="flex items-start gap-3 p-4 rounded-2xl mb-6 text-sm"
                style={{ backgroundColor:'rgba(200,95,45,0.08)', border:'1px solid rgba(200,95,45,0.25)', color:'#C85F2D' }}
                role="alert"
              >
                <XCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{callbackErrorMessage}</span>
              </div>
            )}

            {/* Tabs */}
            <div className="flex rounded-2xl p-1 mb-6" style={{ backgroundColor:'#F7F4ED' }}>
              {[['signin','Sign In'],['signup','Create Account']].map(([t,l]) => (
                <button key={t} onClick={() => { setTab(t); resetTabState() }}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: tab === t ? '#FFFFFF' : 'transparent',
                    color:           tab === t ? '#17211B' : 'rgba(23,33,27,0.4)',
                    boxShadow:       tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  }}>{l}</button>
              ))}
            </div>

            {/* Google (web only -- see IS_NATIVE_APP above) */}
            {!IS_NATIVE_APP && (
              <>
                <button onClick={handleGoogle} type="button"
                  className="w-full py-3 px-4 rounded-2xl border-2 flex items-center justify-center gap-3 font-semibold transition-all hover:bg-gray-50 mb-5"
                  style={{ borderColor:'#DEDDD6', color:'#17211B' }}>
                  <GoogleIcon /> Continue with Google
                </button>

                <div className="relative mb-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" style={{ borderColor:'#DEDDD6' }} />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 text-xs" style={{ backgroundColor:'#FFFFFF', color:'rgba(23,33,27,0.4)' }}>or with email</span>
                  </div>
                </div>
              </>
            )}

          {/* ── Sign Up ── */}
          {tab === 'signup' ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <h1 className="font-display text-3xl font-black mb-1" style={{ color:'#17211B' }}>Create account</h1>
                <p className="text-sm" style={{ color:'rgba(23,33,27,0.4)' }}>Find a verified place or a verified person. Pay for protection first.</p>
              </div>

              {/* Full Name - no live check */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                  style={{ color:'rgba(23,33,27,0.5)' }}>
                  Full Name <span style={{ color:'#C85F2D' }}>*</span>
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="e.g. John Doe"
                  value={form.fullName}
                  onChange={setField('fullName')}
                  autoComplete="name"
                  style={{ backgroundColor:'#FFFFFF', color:'#17211B' }}
                />
              </div>

              {/* Email */}
              <Field
                fieldKey="email"
                label="Email Address"
                type="email"
                placeholder="your@email.com"
                required
                hint="We'll send a confirmation code to this email"
                value={form.email}
                onChange={handleFieldChange('email')}
                status={fieldStatus.email}
                error={fieldErrors.email}
              />

              {/* Phone */}
              <Field
                fieldKey="phone"
                label="Phone Number"
                type="tel"
                placeholder="e.g. 08012345678"
                required
                hint="Used for WhatsApp contact and account recovery"
                value={form.phone}
                onChange={handleFieldChange('phone')}
                status={fieldStatus.phone}
                error={fieldErrors.phone}
              />

              {/* Username */}
              <Field
                fieldKey="username"
                label="Username"
                placeholder="e.g. john_doe (optional)"
                hint="3–20 characters, letters, numbers, underscore only"
                value={form.username}
                onChange={handleFieldChange('username')}
                status={fieldStatus.username}
                error={fieldErrors.username}
              />

              {/* Referral / Invite Code */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                  style={{ color:'rgba(23,33,27,0.5)' }}>
                  Invite Code{' '}
                  <span style={{ color:'rgba(23,33,27,0.3)', fontWeight:400, textTransform:'none', fontSize:11 }}>
                    (optional - from a friend's link)
                  </span>
                </label>
                <div className="relative">
                  <input
                    className="input w-full pr-10"
                    type="text"
                    placeholder="e.g. a3f8bc12"
                    value={form.inviteCode}
                    onChange={e => {
                      const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
                      setForm(f => ({ ...f, inviteCode: val }))
                      if (val) sessionStorage.setItem('dm_ref', val)
                      else sessionStorage.removeItem('dm_ref')
                      if (debounceRef.current['inviteCode']) clearTimeout(debounceRef.current['inviteCode'])
                      setFieldStatus(s => ({ ...s, inviteCode: val.length >= 6 ? 'checking' : null }))
                      setFieldErrors(e2 => ({ ...e2, inviteCode: '' }))
                      if (val.length >= 6) {
                        debounceRef.current['inviteCode'] = setTimeout(() => checkField('inviteCode', val), 700)
                      }
                    }}
                    maxLength={12}
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      backgroundColor: '#FFFFFF',
                      color: '#17211B',
                      borderColor: fieldStatus.inviteCode === 'valid'
                        ? '#7A9E7E'
                        : fieldStatus.inviteCode === 'invalid'
                        ? '#C85F2D'
                        : undefined,
                    }}
                  />
                  {/* Status indicator */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {fieldStatus.inviteCode === 'checking' && (
                      <div className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
                        style={{ borderTopColor:'#C85F2D' }}/>
                    )}
                    {fieldStatus.inviteCode === 'valid' && (
                      <Check size={16} style={{ color:"#7A9E7E" }} />
                    )}
                    {fieldStatus.inviteCode === 'invalid' && (
                      <X size={16} style={{ color:"#C85F2D" }} />
                    )}
                  </div>
                </div>
                {/* Feedback message */}
                {fieldErrors.inviteCode && (
                  <p className="text-xs mt-1 font-semibold"
                    style={{ color: fieldStatus.inviteCode === 'valid' ? '#7A9E7E' : '#C85F2D' }}>
                    {fieldErrors.inviteCode}
                  </p>
                )}
                {!fieldErrors.inviteCode && !form.inviteCode && (
                  <p className="text-xs mt-1" style={{ color:'rgba(23,33,27,0.35)' }}>
                    Have a friend's invite link? Enter their code here.
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                  style={{ color:'rgba(23,33,27,0.5)' }}>
                  Password <span style={{ color:'#C85F2D' }}>*</span>
                </label>
                <div className="relative">
                  <input
                    className="input w-full pr-10"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={setField('password')}
                    autoComplete="new-password"
                    style={{ backgroundColor:'#FFFFFF', color:'#17211B' }}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <PasswordChecklist password={form.password} />
              </div>

              <button type="submit" disabled={
                loading ||
                fieldStatus.email    === 'taken' ||
                fieldStatus.phone    === 'taken' ||
                fieldStatus.username === 'taken' ||
                Object.values(fieldStatus).includes('checking')
              }
                className="w-full py-3.5 rounded-2xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor:'#C85F2D', boxShadow:'0 4px 16px rgba(200,95,45,0.3)' }}>
                {loading ? 'Creating account...' :
                 Object.values(fieldStatus).includes('checking') ? 'Checking availability...' :
                 'Create Account'}
              </button>

              <p className="text-xs text-center" style={{ color:'rgba(23,33,27,0.4)' }}>
                By signing up you agree to our{' '}
                <Link to="/terms" style={{ color:'#C85F2D' }} className="font-semibold hover:underline">Terms</Link>
                {' '}and{' '}
                <Link to="/privacy" style={{ color:'#C85F2D' }} className="font-semibold hover:underline">Privacy Policy</Link>
              </p>
            </form>

          ) : (
            /* ── Sign In ── */
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <h1 className="font-display text-3xl font-black mb-1" style={{ color:'#17211B' }}>Welcome back</h1>
                <p className="text-sm" style={{ color:'rgba(23,33,27,0.4)' }}>Sign in to continue to DealMatch.</p>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                  style={{ color:'rgba(23,33,27,0.5)' }}>Email</label>
                <input className="input w-full" type="email" placeholder="your@email.com"
                  value={form.email} onChange={setField('email')}
                  autoComplete="email"
                  style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                  style={{ color:'rgba(23,33,27,0.5)' }}>Password</label>
                <div className="relative">
                  <input className="input w-full pr-10" type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password} onChange={setField('password')}
                    autoComplete="current-password"
                    style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-2xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor:'#C85F2D', boxShadow:'0 4px 16px rgba(200,95,45,0.3)' }}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button type="button" onClick={handleForgotPassword}
                className="w-full py-2 text-sm font-semibold" style={{ color:'#C85F2D' }}>
                Forgot password?
              </button>
            </form>
          )}
          </div>

          <p className="text-center text-xs mt-6" style={{ color:'rgba(23,33,27,0.35)' }}>
            © {new Date().getFullYear()} DealMatch Technology Limited
          </p>
        </div>
      </div>
    </div>
  )
}
