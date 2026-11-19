import React, { useState } from 'react'
import { KeyIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { fetchVisitCode } from '@/lib/agentVisitApi'

// For an owner whose listing is waiting for a site visit: the code to read out to the agent
// once they are standing at the property. The agent's app never receives it, so a visit
// cannot be recorded from somewhere else.
export default function VisitCodeCard({ propertyId }) {
  const [code, setCode] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const show = async () => {
    setBusy(true); setError(null)
    try { setCode((await fetchVisitCode(propertyId)).code) } catch (e) { setError(e.message) }
    setBusy(false)
  }

  return (
    <div className="mt-3 rounded-2xl border border-line bg-white/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold"><KeyIcon className="h-4 w-4 text-terracotta" aria-hidden="true" /> Site visit code</p>
      <p className="mt-0.5 text-[11px] text-warm">Give this to the agent only when they are at your property and have started their visit.</p>
      {code ? (
        <p className="mt-2 font-display text-3xl tracking-[0.3em]" aria-label={`Visit code ${code.split('').join(' ')}`}>{code}</p>
      ) : (
        <button type="button" onClick={show} className="mt-2 flex items-center gap-2 rounded-full bg-deep px-4 py-2 text-xs font-bold text-white">
          {busy ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Show visit code
        </button>
      )}
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-terracotta-dark">{error}</p> : null}
    </div>
  )
}
