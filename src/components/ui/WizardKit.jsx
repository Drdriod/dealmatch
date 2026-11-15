import React, { cloneElement, isValidElement } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'

// Shared pieces for the multi-step "list something" pages, so they all look and behave the same:
// one clear step indicator, one field style with inline errors, and one sticky action bar that
// stays within thumb reach. Built only from the brand tokens (cream, deep, forest, terracotta).

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'

export const inputClass = '!bg-white !py-3.5 !px-4 text-[15px]'

/** Page frame: back link, title, step indicator, then the step card. */
export function WizardShell({ eyebrow, title, subtitle, steps, step, onStepClick, notice, children }) {
  return (
    <div className="min-h-screen bg-cream pt-8 pb-6 text-deep">
      <div className="mx-auto max-w-2xl px-4">
        <header className="mb-6">
          {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-xl text-sm text-warm">{subtitle}</p> : null}
        </header>

        {notice}

        <StepIndicator steps={steps} step={step} onStepClick={onStepClick} />

        <section
          aria-labelledby="wizard-step-title"
          className="mt-5 rounded-[32px_32px_32px_10px] border border-line bg-white p-5 shadow-card sm:p-7"
        >
          {children}
        </section>
      </div>
    </div>
  )
}

/** "Step 2 of 5" with a segmented bar. Finished steps can be tapped to go back. */
export function StepIndicator({ steps, step, onStepClick }) {
  return (
    <nav aria-label="Progress">
      <p className="mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-[0.12em] text-warm">
        <span>Step {step + 1} of {steps.length}</span>
        <span className="text-deep">{steps[step]}</span>
      </p>
      <ol className="flex gap-1.5">
        {steps.map((label, i) => {
          const done = i < step
          const current = i === step
          const bar = `block h-2 w-full rounded-full transition-colors ${done ? 'bg-forest' : current ? 'bg-terracotta' : 'bg-line'}`
          return (
            <li key={label} className="flex-1">
              {done && onStepClick ? (
                <button type="button" onClick={() => onStepClick(i)} aria-label={`Go back to ${label}`} className={`block w-full rounded-full ${focusRing}`}>
                  <span className={bar} />
                </button>
              ) : (
                <span className={bar} aria-current={current ? 'step' : undefined} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** The heading inside each step card. */
export function StepHeading({ title, children }) {
  return (
    <div className="mb-6">
      <h2 id="wizard-step-title" className="font-display text-2xl">{title}</h2>
      {children ? <p className="mt-1 text-sm text-warm">{children}</p> : null}
    </div>
  )
}

/** Label + control + hint + inline error. The control gets the id and the aria attributes. */
export function Field({ id, label, optional = false, hint, error, children, className = '' }) {
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-error` : undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined,
        className: `${children.props.className || ''}${error ? ' !border-terracotta' : ''}`.trim(),
      })
    : children
  return (
    <div className={className} data-field={id}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-bold">
        <span>{label}</span>
        {optional ? <span className="text-xs font-medium text-warm">Optional</span> : null}
      </label>
      {control}
      {hint && !error ? <p id={hintId} className="mt-1.5 text-xs text-warm">{hint}</p> : null}
      {error ? (
        <p id={errId} role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-terracotta-dark">
          <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** A large tappable choice (one of several). */
export function ChoiceCard({ selected, onClick, icon: Icon, label, description }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-colors ${focusRing} ${selected ? 'border-terracotta bg-orange-pale' : 'border-line bg-white hover:border-deep/30'}`}
    >
      {Icon ? (
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${selected ? 'bg-terracotta text-white' : 'bg-forest-pale text-forest'}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-warm">{description}</span> : null}
      </span>
      {selected ? <CheckCircleSolid className="ml-auto h-5 w-5 flex-shrink-0 text-terracotta" aria-hidden="true" /> : null}
    </button>
  )
}

/** A small toggle pill for multi-select lists. */
export function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${focusRing} ${selected ? 'border-forest bg-forest text-white' : 'border-line bg-white text-deep hover:border-deep/30'}`}
    >
      {selected ? <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

/** A quiet note box (tips, explanations). */
export function InfoBox({ icon: Icon, title, children, tone = 'forest' }) {
  const palette = tone === 'sun' ? 'border-sun/50 bg-sun/15' : 'border-forest/15 bg-forest-pale'
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${palette}`}>
      {Icon ? <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-forest" aria-hidden="true" /> : null}
      <div className="text-xs leading-relaxed text-deep">
        {title ? <p className="mb-0.5 text-sm font-bold">{title}</p> : null}
        {children}
      </div>
    </div>
  )
}

/** Back and Continue, pinned above the phone's tab bar so they are always in reach. */
export function WizardActions({ onBack, onNext, nextLabel = 'Continue', busy = false, busyLabel, hint, last = false }) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 mt-5 md:bottom-4">
      <div className="mx-auto max-w-2xl px-4">
        <div className="rounded-[28px_28px_28px_8px] border border-white/60 bg-white/85 p-2.5 shadow-soft backdrop-blur-xl">
          {hint ? (
            <p className="mb-2 flex items-center justify-center gap-1.5 text-xs font-bold text-terracotta-dark" role="status">
              <ExclamationCircleIcon className="h-4 w-4" aria-hidden="true" />
              {hint}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={busy}
              aria-label="Back"
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-line bg-white text-deep hover:border-deep/30 disabled:opacity-50 ${focusRing}`}
            >
              <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onNext}
            disabled={busy}
            className={`btn-primary !px-6 !py-3.5 flex flex-1 items-center justify-center gap-2 text-[15px] ${focusRing}`}
          >
            {busy ? (busyLabel || 'Working…') : (
              <>
                {last ? <CheckCircleIcon className="h-5 w-5" aria-hidden="true" /> : null}
                {nextLabel}
                {last ? null : <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />}
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
