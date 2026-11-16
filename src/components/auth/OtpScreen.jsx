import React from 'react'
import { ArrowLeftIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import { Alert, Backdrop } from '@/components/auth/AuthParts'

// The "enter the 6-digit code we emailed you" screen. All state lives in AuthPage.
export default function OtpScreen({ email, otp, error, verifying, cooldown, onChange, onKeyDown, onPaste, onConfirm, onResend, onBack }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center bg-cream px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-10 sm:justify-center">
      <Backdrop />
      <div className="relative w-full max-w-sm rounded-[40px_40px_40px_12px] border border-white/70 bg-white/80 p-7 text-center shadow-soft backdrop-blur-xl sm:p-9">
        <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px_22px_22px_8px] bg-orange-pale text-terracotta">
          <EnvelopeIcon className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mb-2 font-display text-3xl text-deep">Check your email</h1>
        <p className="text-sm text-warm">We sent a 6-digit code to</p>
        <p className="mb-6 break-all text-sm font-bold text-terracotta-dark">{email}</p>

        <div role="group" aria-label="6-digit confirmation code" className="mb-4 flex justify-center gap-2 sm:gap-2.5" onPaste={onPaste}>
          {otp.map((digit, i) => (
            <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1}
              aria-label={`Digit ${i + 1} of 6`}
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              value={digit}
              disabled={verifying}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              className={`h-14 w-11 rounded-2xl border-2 text-center text-xl font-black outline-none transition-colors focus:border-terracotta focus:bg-white sm:w-12 ${
                error ? 'border-terracotta bg-orange-pale text-terracotta-dark'
                  : digit ? 'border-terracotta bg-orange-pale text-terracotta-dark' : 'border-line bg-cream text-deep'
              }`}
            />
          ))}
        </div>

        {error ? <div className="mb-4 text-left"><Alert>{error}</Alert></div> : null}

        <button type="button" onClick={onConfirm} disabled={verifying}
          className="btn-primary mb-4 w-full !py-3.5 text-[15px]">
          {verifying ? 'Confirming…' : 'Confirm email'}
        </button>

        <p className="text-sm text-warm">
          Didn&apos;t get it?{' '}
          {cooldown > 0 ? (
            <span className="font-semibold text-deep">Resend in {cooldown}s</span>
          ) : (
            <button type="button" onClick={onResend} className="font-bold text-terracotta-dark hover:underline">Resend code</button>
          )}
        </p>
        <p className="mt-1 text-xs text-warm">Check your spam folder too.</p>

        <button type="button" onClick={onBack}
          className="mx-auto mt-6 flex items-center gap-1.5 text-sm font-semibold text-warm hover:text-deep">
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Change my details
        </button>
      </div>
    </div>
  )
}
