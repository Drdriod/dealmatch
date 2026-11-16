import React from 'react'
import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'

// One field for the sign-in and sign-up forms: label, input, a small status
// icon on the right, and a message underneath (error, success or hint).
//
// Defined in its own module, outside the page component, on purpose: a field
// declared inside a component is a new component type on every render, which
// remounts the input and closes the phone keyboard after each keystroke.

export const authInputClass = '!bg-white !py-3.5 !px-4 text-[15px]'

export function StatusIcon({ status }) {
  if (status === 'checking') return <ArrowPathIcon className="h-4 w-4 animate-spin text-warm" aria-hidden="true" />
  if (status === 'ok') return <CheckCircleIcon className="h-5 w-5 text-forest" aria-hidden="true" />
  if (status === 'bad') return <ExclamationCircleIcon className="h-5 w-5 text-terracotta" aria-hidden="true" />
  return null
}

export default function AuthField({
  id, label, optional = false, hint, error, success, status, trailing, labelAside,
  type = 'text', className = '', ...inputProps
}) {
  const noteId = `${id}-note`
  const note = error || success || hint
  const hasAdornment = Boolean(trailing || status)
  return (
    <div className={className} data-field={id}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold text-deep">
          {label}
          {optional ? <span className="ml-1.5 text-xs font-medium text-warm">Optional</span> : null}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          id={id}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className={`input ${authInputClass} ${hasAdornment ? '!pr-12' : ''} ${error ? '!border-terracotta' : success ? '!border-forest/50' : ''}`}
          {...inputProps}
        />
        {hasAdornment ? (
          <div className="absolute inset-y-0 right-3 flex items-center gap-1">
            {status ? <StatusIcon status={status} /> : null}
            {trailing}
          </div>
        ) : null}
      </div>
      {error ? (
        <p id={noteId} role="alert" className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-terracotta-dark">
          <ExclamationCircleIcon className="mt-px h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : success ? (
        <p id={noteId} role="status" className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-forest">
          <CheckCircleIcon className="mt-px h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {success}
        </p>
      ) : hint ? (
        <p id={noteId} className="mt-1.5 text-xs text-warm">{hint}</p>
      ) : null}
    </div>
  )
}
