import React from 'react'
import { Check } from 'lucide-react'

// Single source of truth for the password rules: the popup, the submit check
// and the error text all read from here, so they cannot drift apart.
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters',      test: (p) => p.length >= 8 },
  { id: 'upper',  label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower',  label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number (0-9)',           test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'One symbol (e.g. ! @ # $ %)', test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(p) },
]

export const isPasswordValid = (password) =>
  PASSWORD_RULES.every((r) => r.test(password || ''))

// Animated reminder that opens under the password field while it has focus.
// Each tick pops in when its rule is met and the bar fills as rules are met.
// Motion is skipped for people who ask their device for reduced motion.
export default function PasswordRules({ password, open, id }) {
  if (!open) return null
  const results = PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password || '') }))
  const metCount = results.filter((r) => r.met).length
  const allMet = metCount === PASSWORD_RULES.length

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className="motion-safe:animate-popover-in absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-line bg-white p-4 shadow-card-hover"
    >
      <span className="absolute -top-1.5 left-6 h-3 w-3 rotate-45 border-l border-t border-line bg-white" aria-hidden="true" />

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-deep/60">
          {allMet ? 'Strong password' : 'Your password needs'}
        </p>
        <p className="text-xs font-semibold text-warm">{metCount} of {PASSWORD_RULES.length}</p>
      </div>

      <div className="mb-3 flex gap-1" aria-hidden="true">
        {results.map((r) => (
          <span key={r.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-deep">
            <span
              className={`block h-full rounded-full transition-all duration-500 ease-out ${r.met ? 'w-full bg-sage' : 'w-0 bg-sage'}`}
            />
          </span>
        ))}
      </div>

      <ul className="grid gap-1.5">
        {results.map((r) => (
          <li
            key={r.id}
            className={`flex items-center gap-2 text-sm transition-colors duration-300 ${r.met ? 'text-forest' : 'text-deep/60'}`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
                r.met ? 'border-sage bg-sage text-white' : 'border-line bg-white'
              }`}
              aria-hidden="true"
            >
              {r.met && <Check size={10} strokeWidth={3.5} className="motion-safe:animate-pop" />}
            </span>
            <span>{r.label}</span>
            <span className="sr-only">{r.met ? 'done' : 'not yet'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
