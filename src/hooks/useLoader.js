import { useCallback, useEffect, useRef, useState } from 'react'
import { createLoader } from '@/lib/loader'

// Runs `load` (an async function that returns the data, or throws) when the page opens and
// whenever `deps` change, and reports { data, loading, error, reload }.
// `reload()` runs it again with a spinner; `reload({ silent: true })` runs it without one.
// `enabled: false` waits (for example until the signed-in user is known), and `loading` stays
// true until then. See src/lib/loader.js for the rules about stale and failed requests.
export function useLoader(load, deps, { enabled = true } = {}) {
  const loadRef = useRef(load)
  loadRef.current = load
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const loaderRef = useRef(null)
  if (!loaderRef.current) loaderRef.current = createLoader(() => loadRef.current(), setState)

  useEffect(() => {
    if (!enabled) return undefined
    const loader = loaderRef.current
    loader.execute()
    return () => loader.cancel()
    // `deps` is the caller's list of what the query depends on.
  }, [enabled, ...deps])

  const reload = useCallback((options) => loaderRef.current.execute(options), [])
  return { ...state, reload }
}
