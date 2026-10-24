// Warms the browser cache for the pages a visitor is most likely to open next, once the home
// page has finished loading and the browser is idle. Skipped on Data Saver and on 2G, where a
// speculative download would cost the visitor more than it saves.
const idle = (fn) =>
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? window.requestIdleCallback(fn, { timeout: 4000 })
    : setTimeout(fn, 2500)

export function shouldPrefetch(connection) {
  if (!connection) return true
  if (connection.saveData) return false
  return !/(^|-)2g$/.test(connection.effectiveType || '')
}

export function prefetchRoutes(loaders) {
  if (typeof navigator === 'undefined' || !shouldPrefetch(navigator.connection)) return
  idle(() => {
    loaders.forEach((load) => { Promise.resolve().then(load).catch(() => {}) })
  })
}
