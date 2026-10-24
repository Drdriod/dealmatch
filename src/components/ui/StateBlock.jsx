import { Loader2 } from 'lucide-react'

export function LoadingBlock({ label = 'Loading' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-warm">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {label}
    </div>
  )
}

export function EmptyBlock({ icon: Icon, title, hint, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
      {Icon ? <Icon className="mx-auto h-6 w-6 text-warm" aria-hidden="true" /> : null}
      <p className="mt-3 text-sm font-semibold text-deep">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-warm">{hint}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

// A short error under a form or button. For a failed page load use LoadNotice instead.
export function InlineError({ message }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-orange-pale px-3 py-2 text-sm text-terracotta-dark">
      {message}
    </p>
  )
}
