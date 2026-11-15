import React from 'react'

// Shown when a saved draft has been put back. "Start over" clears it.
export default function DraftNotice({ draft, onStartOver, photosKept = false }) {
  if (!draft?.restored) return null
  return (
    <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px_20px_20px_6px] border border-forest/20 bg-forest-pale px-4 py-3 text-sm text-forest-dark">
      <span className="font-semibold">{photosKept ? 'We kept what you had filled in.' : 'We kept what you had filled in. Photos need to be added again.'}</span>
      <button
        type="button"
        onClick={() => { draft.clear(); onStartOver?.() }}
        className="rounded-full border border-forest/30 bg-white/70 px-3.5 py-1.5 text-xs font-bold text-forest-dark hover:bg-white"
      >
        Start over
      </button>
    </div>
  )
}
