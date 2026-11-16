import React from 'react'
import { CheckCircleIcon, ExclamationCircleIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

// Small pieces shared by the sign-in, sign-up and code-entry screens.

// Soft blurred drops behind the card, the same water-drop motif as the rest of the site.
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/15 blur-3xl" />
      <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/20 blur-3xl" />
      <div className="absolute left-1/3 top-2/3 h-48 w-48 rounded-full bg-sun/25 blur-3xl" />
    </div>
  )
}

export function Alert({ children, tone = 'error' }) {
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

export function PasswordToggle({ shown, onToggle }) {
  const Icon = shown ? EyeSlashIcon : EyeIcon
  return (
    <button type="button" onClick={onToggle} aria-label={shown ? 'Hide password' : 'Show password'}
      className="rounded-full p-1 text-warm hover:text-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}
