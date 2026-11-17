/**
 * ResetPasswordPage - DealMatch
 * ══════════════════════════════
 * Handles the Supabase password-reset email link for BOTH:
 *   • Regular users  (redirectTo: /auth/reset-password)
 *   • Admin / Staff  (redirectTo: /auth/reset-password  ← standardised)
 *
 * Supabase PKCE reset flow:
 *   1. User requests reset → Supabase emails a link
 *   2. Link contains ?code=<PKCE_CODE> (PKCE flow) or #access_token= (implicit)
 *   3. This page exchanges the code for a session, then lets the user set a new password
 *   4. On success → redirects to the correct home (admin → /admin, user → /browse)
 *
 * Security:
 *   • Password strength enforced: min 8 chars, upper+lower+number+special
 *   • Confirm password match check before submit
 *   • Token is consumed on use - page is useless after first successful reset
 *   • No password ever logged or stored client-side (and no draft is kept on this page)
 *
 * Staff see the same page in a dark theme.
 */

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircleIcon, CheckIcon, ExclamationCircleIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, LockClosedIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'
import { isStaff } from '@/lib/adminAccess'
import { fetchProfileRole } from '@/data/profileRepository'
import { motion } from 'motion/react'
import toast from 'react-hot-toast'

// ── Password strength rules ───────────────────────────────────────────────────
const RULES = [
  { id: 'len',     label: 'At least 8 characters',          test: (p) => p.length >= 8 },
  { id: 'upper',   label: 'One uppercase letter (A–Z)',      test: (p) => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'One lowercase letter (a–z)',      test: (p) => /[a-z]/.test(p) },
  { id: 'number',  label: 'One number (0–9)',                test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character (!@#$…)',   test: (p) => /[^A-Za-z0-9]/.test(p) },
]

function strength(p) {
  const passed = RULES.filter((r) => r.test(p)).length
  if (passed <= 1) return { score: 1, label: 'Very weak',   bar: 'bg-danger',     text: 'text-danger' }
  if (passed === 2) return { score: 2, label: 'Weak',       bar: 'bg-terracotta', text: 'text-terracotta' }
  if (passed === 3) return { score: 3, label: 'Fair',       bar: 'bg-gold',       text: 'text-gold' }
  if (passed === 4) return { score: 4, label: 'Strong',     bar: 'bg-sage',       text: 'text-sage' }
  return              { score: 5, label: 'Very strong', bar: 'bg-sky',        text: 'text-sky' }
}

// Look of the page: light glass for members, dark glass for staff.
const THEMES = {
  user: {
    page: 'bg-cream text-deep',
    card: 'border-white/70 bg-white/80 shadow-soft',
    sub: 'text-warm',
    label: 'text-deep',
    input: 'border-line bg-white text-deep placeholder:text-warm/70 focus:border-terracotta',
    eye: 'text-warm hover:text-deep',
    track: 'bg-deep/10',
    badge: 'bg-orange-pale text-terracotta',
    button: 'bg-terracotta text-white hover:bg-terracotta-dark',
    link: 'text-terracotta-dark',
    err: 'text-terracotta-dark',
    alert: 'border-terracotta/30 bg-orange-pale text-terracotta-dark',
    ok: 'text-forest',
    bad: 'text-terracotta',
    spin: 'border-t-terracotta',
  },
  admin: {
    page: 'bg-deep text-white',
    card: 'border-white/10 bg-white/5 shadow-none',
    sub: 'text-white/60',
    label: 'text-white/80',
    input: 'border-white/15 bg-white/10 text-white placeholder:text-white/40 focus:border-gold',
    eye: 'text-white/60 hover:text-white',
    track: 'bg-white/10',
    badge: 'bg-gold/15 text-gold',
    button: 'bg-gold text-deep hover:bg-sun',
    link: 'text-gold',
    err: 'text-sun',
    alert: 'border-gold/30 bg-gold/10 text-sun',
    ok: 'text-sage',
    bad: 'text-sun',
    spin: 'border-t-gold',
  },
}

// A password input with a show/hide toggle and a message underneath.
function PasswordField({ id, label, theme, value, onChange, shown, onToggle, placeholder, error, children }) {
  return (
    <div data-field={id}>
      <label htmlFor={id} className={`mb-1.5 block text-sm font-bold ${theme.label}`}>{label}</label>
      <div className="relative">
        <input id={id} type={shown ? 'text' : 'password'} value={value} onChange={onChange}
          placeholder={placeholder} autoComplete="new-password"
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
          className={`w-full rounded-2xl border py-3.5 pl-4 pr-12 text-[15px] outline-none transition-colors ${theme.input} ${error ? '!border-terracotta' : ''}`} />
        <button type="button" onClick={onToggle} aria-label={shown ? 'Hide password' : 'Show password'}
          className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${theme.eye}`}>
          {shown ? <EyeSlashIcon className="h-5 w-5" aria-hidden="true" /> : <EyeIcon className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className={`mt-1.5 flex items-start gap-1 text-xs font-semibold ${theme.err}`}>
          <ExclamationCircleIcon className="mt-px h-4 w-4 flex-shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}
      {children}
    </div>
  )
}

export default function ResetPasswordPage() {
  const navigate            = useNavigate()
  const [searchParams]      = useSearchParams()
  const ranOnce             = useRef(false)

  const [stage,     setStage]     = useState('loading')  // loading | ready | success | error
  const [isAdmin,   setIsAdmin]   = useState(false)
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [errMsg,    setErrMsg]    = useState('')
  const [errors,    setErrors]    = useState({})
  const [formError, setFormError] = useState('')

  const pw        = strength(password)
  const allPassed = RULES.every((r) => r.test(password))
  const matches   = password.length > 0 && password === confirm
  const theme     = isAdmin ? THEMES.admin : THEMES.user
  const home      = isAdmin ? '/staff-gate-7f3k' : '/auth'

  // ── Step 1: Exchange the reset code for a session ─────────────────────────
  // Supabase PKCE sends ?code=… in the URL. We must call exchangeCodeForSession
  // before the user can call updateUser. Without this, updateUser will fail with
  // "Auth session missing".
  useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true

    const init = async () => {
      const code = searchParams.get('code')

      // ── PKCE code exchange ──────────────────────────────────────────────
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[ResetPassword] Code exchange failed:', error.message)
          setErrMsg('This reset link has expired or has already been used. Request a new one.')
          setStage('error')
          return
        }
        // Check if the signed-in user is an admin
        if (data?.session?.user) {
          const { data: profile } = await fetchProfileRole(data.session.user.id)
          setIsAdmin(isStaff(profile?.role))
        }
        setStage('ready')
        return
      }

      // ── Fallback: check for existing session ────────────────────────────
      // Handles the legacy implicit flow (#access_token=… hash) where Supabase
      // automatically sets the session from the URL fragment before we load.
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session) {
        const { data: profile } = await fetchProfileRole(sessionData.session.user.id)
        setIsAdmin(isStaff(profile?.role))
        setStage('ready')
        return
      }

      // No code, no session - invalid link
      setErrMsg('We couldn\'t find a valid reset link. Request a new one to continue.')
      setStage('error')
    }

    init()
  }, [searchParams])

  // ── Step 2: Update password ───────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    const errs = {}
    if (!allPassed) errs.password = 'Your password doesn\'t meet all the requirements yet.'
    if (!confirm) errs.confirm = 'Re-enter your new password.'
    else if (!matches) errs.confirm = 'Passwords do not match.'
    setErrors(errs)
    if (errs.password || errs.confirm) {
      document.getElementById(errs.password ? 'rp-password' : 'rp-confirm')?.focus()
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        // Common errors:
        // "New password should be different from the old password"
        // "Auth session missing" → code wasn't exchanged
        const m = error.message?.toLowerCase() || ''
        if (m.includes('same password') || m.includes('different from')) {
          setFormError('New password must be different from your current password.')
        } else if (m.includes('session missing')) {
          setFormError('Your session has expired. Request a new reset link.')
        } else {
          setFormError(error.message || 'We couldn\'t update your password. Please try again.')
        }
        setSaving(false)
        return
      }

      setStage('success')
      toast.success('Password updated.')

      // Sign out so the user re-authenticates cleanly with their new password
      await supabase.auth.signOut()

      setTimeout(() => {
        navigate(home, { replace: true })
      }, 2500)
    } catch (err) {
      console.error('[ResetPassword] updateUser error:', err)
      setFormError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const badge = (Icon, extra = '') => (
    <span className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px_22px_22px_8px] ${theme.badge} ${extra}`}>
      <Icon className="h-8 w-8" aria-hidden="true" />
    </span>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`relative flex min-h-svh items-center justify-center px-4 pb-28 pt-10 md:pb-10 ${theme.page}`}>
      {!isAdmin ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/15 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/20 blur-3xl" />
        </div>
      ) : null}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className={`relative w-full max-w-sm rounded-[40px_40px_40px_12px] border p-7 backdrop-blur-xl sm:p-9 ${theme.card}`}>

        {/* ── Loading ── */}
        {stage === 'loading' && (
          <div role="status" className="flex flex-col items-center justify-center gap-4 py-12">
            <div className={`h-10 w-10 animate-spin rounded-full border-2 border-transparent ${theme.spin}`} />
            <p className={`text-sm ${theme.sub}`}>Verifying reset link…</p>
          </div>
        )}

        {/* ── Error ── */}
        {stage === 'error' && (
          <div className="text-center">
            {badge(ExclamationTriangleIcon)}
            <h1 className="mb-3 font-display text-3xl">This link has expired</h1>
            <p className={`mb-6 text-sm leading-relaxed ${theme.sub}`}>{errMsg}</p>
            <button type="button" onClick={() => navigate(home, { replace: true })}
              className={`w-full rounded-full py-3.5 text-[15px] font-bold transition-colors ${theme.button}`}>
              Request a new link
            </button>
          </div>
        )}

        {/* ── Ready: Set new password ── */}
        {stage === 'ready' && (
          <>
            <div className="mb-6 text-center">
              {badge(LockClosedIcon)}
              <h1 className="mb-2 font-display text-3xl">Let&apos;s get you back in.</h1>
              <p className={`text-sm ${theme.sub}`}>
                {isAdmin
                  ? 'Choose a strong password for your admin account.'
                  : 'Choose a new password to get back into your DealMatch account.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <PasswordField id="rp-password" label="New password" theme={theme}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((er) => ({ ...er, password: '' })); setFormError('') }}
                shown={showPass} onToggle={() => setShowPass((v) => !v)}
                placeholder="Enter new password" error={errors.password}>
                {password.length > 0 && (
                  <div className="mt-3">
                    <div className={`mb-1.5 h-1.5 overflow-hidden rounded-full ${theme.track}`}>
                      <div className={`h-full rounded-full transition-all duration-300 ${pw.bar}`} style={{ width: `${(pw.score / 5) * 100}%` }} />
                    </div>
                    <p className={`text-xs font-bold ${pw.text}`}>{pw.label}</p>
                    <ul className="mt-2 space-y-1">
                      {RULES.map((r) => {
                        const ok = r.test(password)
                        const Icon = ok ? CheckIcon : XMarkIcon
                        return (
                          <li key={r.id} className={`flex items-center gap-2 text-xs ${ok ? theme.ok : theme.sub}`}>
                            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${ok ? '' : theme.bad}`} aria-hidden="true" />
                            <span>{r.label}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </PasswordField>

              <PasswordField id="rp-confirm" label="Confirm password" theme={theme}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setErrors((er) => ({ ...er, confirm: '' })); setFormError('') }}
                shown={showConf} onToggle={() => setShowConf((v) => !v)}
                placeholder="Re-enter new password"
                error={errors.confirm || (confirm.length > 0 && !matches ? 'Passwords do not match.' : '')}>
                {matches ? (
                  <p role="status" className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${theme.ok}`}>
                    <CheckCircleIcon className="h-4 w-4" aria-hidden="true" /> Passwords match
                  </p>
                ) : null}
              </PasswordField>

              {formError ? (
                <div role="alert" className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-sm font-semibold ${theme.alert}`}>
                  <ExclamationCircleIcon className="mt-px h-5 w-5 flex-shrink-0" aria-hidden="true" /> <span>{formError}</span>
                </div>
              ) : null}

              <button type="submit" disabled={saving}
                className={`mt-2 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-bold transition-colors disabled:opacity-60 ${theme.button}`}>
                {saving
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <><LockClosedIcon className="h-4 w-4" aria-hidden="true" /> Reset password</>}
              </button>
            </form>

            <p className={`mt-5 text-center text-xs ${theme.sub}`}>
              Remembered your password?{' '}
              <button type="button" onClick={() => navigate(home, { replace: true })} className={`font-bold underline ${theme.link}`}>
                Sign in
              </button>
            </p>
          </>
        )}

        {/* ── Success ── */}
        {stage === 'success' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center" role="status">
            {badge(CheckCircleIcon)}
            <h1 className="mb-3 font-display text-3xl">Password updated.</h1>
            <p className={`text-sm leading-relaxed ${theme.sub}`}>
              Your password has been changed. Taking you to {isAdmin ? 'the admin portal' : 'sign in'}…
            </p>
            <div className={`mx-auto mt-5 h-6 w-6 animate-spin rounded-full border-2 border-transparent ${theme.spin}`} />
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
