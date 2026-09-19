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
 *   • No password ever logged or stored client-side
 */

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Eye, EyeOff, Lock, Shield, User, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
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
  const passed = RULES.filter(r => r.test(p)).length
  if (passed <= 1) return { score: 1, label: 'Very weak',  color: '#C96A3A' }
  if (passed === 2) return { score: 2, label: 'Weak',       color: '#E07B39' }
  if (passed === 3) return { score: 3, label: 'Fair',       color: '#D4A853' }
  if (passed === 4) return { score: 4, label: 'Strong',     color: '#7A9E7E' }
  return              { score: 5, label: 'Very strong', color: '#5B8DEF' }
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

  const pw        = strength(password)
  const allPassed = RULES.every(r => r.test(password))
  const matches   = password.length > 0 && password === confirm

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
          setErrMsg('This reset link has expired or already been used. Please request a new one.')
          setStage('error')
          return
        }
        // Check if the signed-in user is an admin
        if (data?.session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, email')
            .eq('id', data.session.user.id)
            .maybeSingle()
          setIsAdmin(
            data.session.user.email === 'divineandbassey@gmail.com' ||
            ['admin', 'agent', 'verifier'].includes(profile?.role)
          )
        }
        setStage('ready')
        return
      }

      // ── Fallback: check for existing session ────────────────────────────
      // Handles the legacy implicit flow (#access_token=… hash) where Supabase
      // automatically sets the session from the URL fragment before we load.
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', sessionData.session.user.id)
          .maybeSingle()
        setIsAdmin(
          sessionData.session.user.email === 'divineandbassey@gmail.com' ||
          ['admin', 'agent', 'verifier'].includes(profile?.role)
        )
        setStage('ready')
        return
      }

      // No code, no session - invalid link
      setErrMsg('No valid reset token found. Please request a new password reset link.')
      setStage('error')
    }

    init()
  }, [searchParams])

  // ── Step 2: Update password ───────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!allPassed) { toast.error('Password does not meet all requirements'); return }
    if (!matches)   { toast.error('Passwords do not match'); return }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        // Common errors:
        // "New password should be different from the old password"
        // "Auth session missing" → code wasn't exchanged
        if (error.message?.toLowerCase().includes('same password') ||
            error.message?.toLowerCase().includes('different from')) {
          toast.error('New password must be different from your current password.')
        } else if (error.message?.toLowerCase().includes('session missing')) {
          toast.error('Session expired. Please request a new reset link.')
        } else {
          toast.error(error.message || 'Failed to update password. Please try again.')
        }
        setSaving(false)
        return
      }

      setStage('success')
      toast.success('Password updated successfully!')

      // Sign out so the user re-authenticates cleanly with their new password
      await supabase.auth.signOut()

      setTimeout(() => {
        navigate(isAdmin ? '/staff-gate-7f3k' : '/auth', { replace: true })
      }, 2500)
    } catch (err) {
      console.error('[ResetPassword] updateUser error:', err)
      toast.error('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const bgColor = isAdmin ? '#1A1210' : '#FFFAF5'
  const accent  = isAdmin ? '#D4A853' : '#C96A3A'
  const textPri = isAdmin ? '#FFFFFF' : '#1A1210'
  const textSub = isAdmin ? 'rgba(255,255,255,0.5)' : '#8A7E78'
  const inputBg = isAdmin ? 'rgba(255,255,255,0.07)' : '#FFFFFF'
  const inputBd = isAdmin ? 'rgba(255,255,255,0.12)' : '#E8DDD2'

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: bgColor }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* ── Loading ── */}
        {stage === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div
              className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
              style={{ borderTopColor: accent }}
            />
            <p className="text-sm" style={{ color: textSub }}>Verifying reset link…</p>
          </div>
        )}

        {/* ── Error ── */}
        {stage === 'error' && (
          <div className="text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgba(201,106,58,0.12)', border: `1px solid rgba(201,106,58,0.25)` }}
            >
              <AlertTriangle size={28} style={{ color: '#C96A3A' }} />
            </div>
            <h2 className="font-display font-black text-2xl mb-3" style={{ color: textPri }}>
              Link Expired
            </h2>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: textSub }}>
              {errMsg}
            </p>
            <button
              onClick={() => navigate(isAdmin ? '/staff-gate-7f3k' : '/auth', { replace: true })}
              className="w-full py-4 rounded-2xl text-sm font-bold"
              style={{ backgroundColor: accent, color: isAdmin ? '#1A1210' : '#FFFFFF' }}
            >
              Request New Link
            </button>
          </div>
        )}

        {/* ── Ready: Set new password ── */}
        {stage === 'ready' && (
          <>
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{
                  backgroundColor: `${accent}18`,
                  border: `1px solid ${accent}33`,
                }}
              >
                <Lock size={26} style={{ color: accent }} />
              </div>
              <h1 className="font-display font-black text-2xl mb-2" style={{ color: textPri }}>
                Set New Password
              </h1>
              <p className="text-sm" style={{ color: textSub }}>
                {isAdmin
                  ? 'Choose a strong password for your admin account.'
                  : 'Choose a strong password for your DealMatch account.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* New password */}
              <div>
                <label
                  className="text-xs font-semibold mb-1.5 block"
                  style={{ color: textSub }}
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none pr-11"
                    style={{
                      backgroundColor: inputBg,
                      border: `1px solid ${inputBd}`,
                      color: textPri,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: textSub }}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Strength bar */}
                {password.length > 0 && (
                  <div className="mt-2">
                    <div
                      className="h-1.5 rounded-full overflow-hidden mb-1.5"
                      style={{ backgroundColor: isAdmin ? 'rgba(255,255,255,0.08)' : 'rgba(26,18,16,0.08)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${(pw.score / 5) * 100}%`,
                          backgroundColor: pw.color,
                        }}
                      />
                    </div>
                    <p className="text-xs font-semibold" style={{ color: pw.color }}>
                      {pw.label}
                    </p>
                  </div>
                )}

                {/* Rules checklist */}
                {password.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {RULES.map(r => {
                      const ok = r.test(password)
                      return (
                        <li key={r.id} className="flex items-center gap-2 text-xs">
                          {ok
                            ? <Check size={11} style={{ color: '#7A9E7E', flexShrink: 0 }} />
                            : <X size={11} style={{ color: '#C96A3A', flexShrink: 0 }} />
                          }
                          <span style={{ color: ok ? '#7A9E7E' : textSub }}>{r.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label
                  className="text-xs font-semibold mb-1.5 block"
                  style={{ color: textSub }}
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConf ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none pr-11"
                    style={{
                      backgroundColor: inputBg,
                      border: `1px solid ${
                        confirm.length > 0
                          ? matches ? '#7A9E7E' : '#C96A3A'
                          : inputBd
                      }`,
                      color: textPri,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConf(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: textSub }}
                  >
                    {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirm.length > 0 && !matches && (
                  <p className="text-xs mt-1" style={{ color: '#C96A3A' }}>
                    Passwords do not match
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={saving || !allPassed || !matches}
                className="w-full py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 mt-2"
                style={{
                  backgroundColor: (!allPassed || !matches || saving)
                    ? isAdmin ? 'rgba(255,255,255,0.08)' : 'rgba(26,18,16,0.08)'
                    : accent,
                  color: (!allPassed || !matches || saving)
                    ? isAdmin ? 'rgba(255,255,255,0.3)' : 'rgba(26,18,16,0.3)'
                    : isAdmin ? '#1A1210' : '#FFFFFF',
                  cursor: (!allPassed || !matches) ? 'not-allowed' : 'pointer',
                }}
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <><Lock size={14} /> Update Password</>
                }
              </button>
            </form>

            <p className="text-xs text-center mt-5" style={{ color: textSub }}>
              Remembered your password?{' '}
              <button
                onClick={() => navigate(isAdmin ? '/staff-gate-7f3k' : '/auth', { replace: true })}
                className="font-semibold underline"
                style={{ color: accent }}
              >
                Sign in
              </button>
            </p>
          </>
        )}

        {/* ── Success ── */}
        {stage === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: 'rgba(122,158,126,0.15)', border: '2px solid rgba(122,158,126,0.4)' }}
            >
              <Check size={36} style={{ color: '#7A9E7E' }} />
            </div>
            <h1 className="font-display font-black text-2xl mb-3" style={{ color: textPri }}>
              Password Updated!
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: textSub }}>
              Your password has been changed successfully. Redirecting you to{' '}
              {isAdmin ? 'the admin portal' : 'sign in'}…
            </p>
            <div className="mt-4">
              <div
                className="w-6 h-6 border-2 border-transparent rounded-full animate-spin mx-auto"
                style={{ borderTopColor: accent }}
              />
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
