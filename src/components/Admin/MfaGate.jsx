import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import { Shield, LogOut } from 'lucide-react'

// Requires an authenticator-app (TOTP) second factor before rendering
// children, for any account that reaches this gate. Checklist item 17:
// staff/admin access previously relied on nothing but a password. This
// makes a second factor mandatory rather than optional for those accounts
// specifically, without touching the login flow for ordinary buyers/sellers
// who never reach this component.
//
// Supabase MFA has two pieces that matter here:
//  - listFactors(): which factors this account has verified, if any
//  - getAuthenticatorAssuranceLevel(): whether *this session* has actually
//    completed a challenge (aal2) or only a password login (aal1). A staff
//    member can have a verified factor from a previous session and still
//    need to challenge it again now - enrollment and challenge are
//    deliberately separate steps below.
export default function MfaGate({ children }) {
  const { user } = useAuth()
  const [status, setStatus] = useState('checking') // checking | enroll | challenge | ready
  const [factorId, setFactorId] = useState(null)
  const [qrCode, setQrCode] = useState(null)
  const [secret, setSecret] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [challengeId, setChallengeId] = useState(null)

  const check = async () => {
    setStatus('checking')
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData?.currentLevel === 'aal2') { setStatus('ready'); return }

    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const verifiedTotp = (factorsData?.totp || []).find(f => f.status === 'verified')

    if (!verifiedTotp) {
      // No factor yet - enroll one now. Any half-finished, unverified
      // factor from an abandoned attempt is unenrolled first so we don't
      // pile up dead factors every time someone reloads mid-setup.
      const stale = (factorsData?.totp || []).filter(f => f.status !== 'verified')
      for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id })

      const { data: enrollData, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) { toast.error(error.message || 'Could not start MFA setup'); return }
      setFactorId(enrollData.id)
      setQrCode(enrollData.totp.qr_code)
      setSecret(enrollData.totp.secret)
      setStatus('enroll')
      return
    }

    // Verified factor exists but this session hasn't challenged it yet.
    setFactorId(verifiedTotp.id)
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id })
    if (challengeErr) { toast.error(challengeErr.message || 'Could not start MFA challenge'); return }
    setChallengeId(challenge.id)
    setStatus('challenge')
  }

  useEffect(() => { check() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submitEnrollment = async () => {
    if (code.length !== 6) return
    setBusy(true)
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr) { setBusy(false); toast.error(challengeErr.message || 'Could not verify code'); return }
    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    setBusy(false)
    if (verifyErr) { toast.error('Incorrect code. Check your authenticator app and try again.'); return }
    toast.success('Two-factor authentication enabled')
    setCode('')
    setStatus('ready')
  }

  const submitChallenge = async () => {
    if (code.length !== 6 || !challengeId) return
    setBusy(true)
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
    setBusy(false)
    if (error) { toast.error('Incorrect code'); setCode(''); return }
    setStatus('ready')
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#120D0B' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#D4A853' }} />
      </div>
    )
  }

  if (status === 'ready') return children

  const isEnroll = status === 'enroll'

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#120D0B' }}>
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-4" style={{ backgroundColor: '#1E1510', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(212,168,83,0.12)' }}>
            <Shield size={18} style={{ color: '#D4A853' }} />
          </div>
          <div>
            <h3 className="text-white font-bold">{isEnroll ? 'Set up two-factor authentication' : 'Enter your two-factor code'}</h3>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Required for every staff and admin account</p>
          </div>
        </div>

        {isEnroll && qrCode && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Scan this with an authenticator app (Google Authenticator, Authy, 1Password) then enter the 6-digit code it shows.
            </p>
            <div className="bg-white rounded-2xl p-3 flex items-center justify-center">
              <img src={qrCode} alt="MFA QR code" className="w-40 h-40" />
            </div>
            {secret && (
              <p className="text-[11px] text-center break-all" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Can't scan it? Enter this key manually: {secret}
              </p>
            )}
          </div>
        )}

        <input
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={e => { if (e.key === 'Enter') (isEnroll ? submitEnrollment() : submitChallenge()) }}
          inputMode="numeric"
          placeholder="000000"
          className="w-full text-center tracking-[0.4em] text-lg rounded-xl px-4 py-3 outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
        />

        <button
          onClick={isEnroll ? submitEnrollment : submitChallenge}
          disabled={busy || code.length !== 6}
          className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-50"
          style={{ backgroundColor: '#D4A853', color: '#17211B' }}
        >
          {busy ? 'Verifying...' : isEnroll ? 'Enable two-factor authentication' : 'Verify'}
        </button>

        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full py-2 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <LogOut size={12} /> Sign out instead
        </button>
      </div>
    </div>
  )
}
