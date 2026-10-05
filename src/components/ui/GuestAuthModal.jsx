import React, { useState, useRef } from 'react'
import { Phone, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * <GuestAuthModal onClose={...} onSuccess={(user) => ...} />
 *
 * The guest/no-account path from the product handoff spec (section 6.1):
 *   Name + Phone (OTP) -> verified -> continue the booking, deposit, or
 *   job post the user was already in the middle of.
 *
 * This intentionally does NOT route through /auth (full email/password +
 * username signup + onboarding wizard). It creates the lightest possible
 * account - phone number + optional name - and leaves
 * profile.onboarding_completed = false, which is fine: every screen that
 * calls this modal already renders with <ProtectedRoute requireOnboarding=
 * {false}> or is a public route, so a guest is never forced through the
 * full onboarding flow just to complete one booking. They can finish their
 * profile later from /profile whenever they want.
 *
 * Requires Supabase Auth's Phone provider (SMS OTP, e.g. via Twilio) to be
 * enabled in the Supabase project - see PRODUCTION_HANDOFF.md. If it isn't
 * configured yet, signInWithOtp() returns a clear provider error and this
 * component falls back to directing the person to /auth instead of failing
 * silently.
 */
export default function GuestAuthModal({ onClose, onSuccess, title = 'Continue', subtitle = 'Verify your phone number to continue - no password needed.' }) {
  const [step, setStep]         = useState('phone') // 'phone' | 'otp'
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [otp, setOtp]           = useState('')
  const [sending, setSending]   = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  const otpInputRef = useRef(null)

  const normalizePhone = (raw) => {
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('0'))  return '+234' + digits.slice(1)   // local NG format
    if (digits.startsWith('234')) return '+' + digits
    if (raw.trim().startsWith('+')) return '+' + digits
    return '+234' + digits
  }

  const handleSendOtp = async () => {
    const cleanDigits = phone.replace(/\D/g, '')
    if (cleanDigits.length < 10) { toast.error('Enter a valid phone number'); return }

    setSending(true)
    const e164 = normalizePhone(phone)
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { data: name.trim() ? { full_name: name.trim() } : undefined },
    })
    setSending(false)

    if (error) {
      // Provider not configured, or genuinely invalid number - either way,
      // don't dead-end the person. Offer the full sign-up as a fallback.
      if (/provider|not enabled|unsupported/i.test(error.message || '')) {
        setUnsupported(true)
      } else {
        toast.error(error.message || 'Could not send code. Try again.')
      }
      return
    }

    setPhone(e164)
    setStep('otp')
    toast.success('Code sent - check your SMS')
    setTimeout(() => otpInputRef.current?.focus(), 50)
  }

  const handleVerifyOtp = async () => {
    if (otp.replace(/\D/g, '').length < 4) { toast.error('Enter the code you received'); return }
    setVerifying(true)
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: otp.trim(), type: 'sms' })
    setVerifying(false)

    if (error) { toast.error(error.message || 'Invalid or expired code'); return }
    if (!data?.user) { toast.error('Verification failed. Try again.'); return }

    // Best-effort: persist the display name if one was given and the
    // auto-created profile doesn't already have one. Never blocks success.
    if (name.trim()) {
      try {
        await supabase.from('profiles')
          .update({ full_name: name.trim(), phone })
          .eq('id', data.user.id)
          .is('full_name', null)
      } catch { /* non-fatal */ }
    }

    toast.success('Verified!')
    onSuccess?.(data.user)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(23,33,27,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 pb-8" style={{ backgroundColor: '#FFFAF5', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5 sm:hidden" style={{ backgroundColor: '#DEDDD6' }} />

        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0D4BE' }}>
            <ShieldCheck size={18} style={{ color: '#C85F2D' }} />
          </div>
          <div>
            <h3 className="font-display text-lg font-black" style={{ color: '#17211B' }}>{title}</h3>
          </div>
        </div>
        <p className="text-xs mb-5" style={{ color: '#647068' }}>{subtitle}</p>

        {unsupported ? (
          <div className="text-center py-4">
            <p className="text-sm mb-4" style={{ color: '#1F2B24' }}>
              Phone sign-in isn't available right now. Please continue with email instead - it only takes a minute.
            </p>
            <a href="/auth" className="block w-full text-center py-3 rounded-2xl font-bold text-sm text-white" style={{ backgroundColor: '#C85F2D' }}>
              Continue with email
            </a>
          </div>
        ) : step === 'phone' ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: '#17211B' }}>Your name (optional)</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Amaka"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
                style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }}
              />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: '#17211B' }}>Phone number *</label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
                <Phone size={15} style={{ color: '#647068' }} />
                <input
                  value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="0801 234 5678" inputMode="tel"
                  className="flex-1 outline-none text-sm bg-transparent" style={{ color: '#17211B' }}
                  onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                />
              </div>
            </div>
            <button onClick={handleSendOtp} disabled={sending}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: '#C85F2D' }}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <>Send code <ArrowRight size={15} /></>}
            </button>
            <p className="text-[11px] text-center" style={{ color: '#647068' }}>
              By continuing you agree to DealMatch's <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy Policy</a>.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: '#647068' }}>Enter the code sent to <b style={{ color:'#17211B' }}>{phone}</b></p>
            <input
              ref={otpInputRef}
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456" inputMode="numeric"
              className="w-full px-4 py-3 rounded-2xl text-center text-lg tracking-[0.5em] outline-none font-bold"
              style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }}
              onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
            />
            <button onClick={handleVerifyOtp} disabled={verifying}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: '#C85F2D' }}>
              {verifying ? <Loader2 size={16} className="animate-spin" /> : 'Verify & continue'}
            </button>
            <button onClick={() => { setStep('phone'); setOtp('') }} className="w-full text-center text-xs font-medium py-2" style={{ color: '#647068' }}>
              Use a different number
            </button>
          </div>
        )}

        <button onClick={onClose} className="w-full text-center text-xs font-medium py-2 mt-1" style={{ color: '#647068' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
