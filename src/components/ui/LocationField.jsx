import React, { useEffect, useRef, useState } from 'react'
import { hasLocationLookup, searchLocations } from '@/lib/location'

/**
 * "Where?" input used by search and onboarding.
 *
 * Works as a plain text box today. When a lookup service is configured
 * (see src/lib/location.js) it shows suggestions as the person types and
 * hands the chosen option back as the second argument of onChange.
 *
 * onChange(text, option?)  option is only set when a suggestion was picked.
 */
export default function LocationField({
  value, onChange, placeholder = 'City or area', className = '', id, ariaLabel = 'Location',
}) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const lookup = hasLocationLookup()

  useEffect(() => {
    if (!lookup) return undefined
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      const found = await searchLocations(value, { signal: ctrl.signal })
      if (!ctrl.signal.aborted) { setOptions(found); setOpen(found.length > 0) }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [value, lookup])

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={boxRef} className="relative w-full min-w-0">
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className={className}
      />
      {open && options.length > 0 && (
        <ul role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-30 max-h-60 overflow-auto rounded-2xl bg-white shadow-soft py-1"
          style={{ border: '1px solid #DEDDD6' }}>
          {options.map(o => (
            <li key={o.id} role="option" aria-selected="false">
              <button type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(o.label, o); setOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#F7F4ED]"
                style={{ color: '#17211B' }}>
                {o.label}
                {o.postcode && <span className="ml-2 text-xs" style={{ color: '#647068' }}>{o.postcode}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
