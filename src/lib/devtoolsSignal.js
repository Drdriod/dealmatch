// The "DevTools opened" signal compares the browser window size with the page size. That also
// differs for a docked browser side panel, page zoom and a phone's address bar, so it fires
// for ordinary visitors. Sentry showed it as most of the security events, repeated for the
// same person minute after minute. This keeps it to one report per browser session and leaves
// out touch-first devices, where the size gap is not a sign of DevTools at all.

const THRESHOLD = 160

// True when the window is much bigger than the page in either direction.
export function looksLikeDevtools({ outerWidth, innerWidth, outerHeight, innerHeight }) {
  return outerWidth - innerWidth > THRESHOLD || outerHeight - innerHeight > THRESHOLD
}

// `env` is injected so this can be tested: { win, coarsePointer, storage }.
export function createDevtoolsWatcher({ win, coarsePointer, storage, report }) {
  const KEY = '_dm_devtools_reported'
  let open = false
  return function check() {
    if (coarsePointer) return false
    const now = looksLikeDevtools(win)
    if (!now) { open = false; return false }
    if (open) return false
    open = true
    try { if (storage.getItem(KEY)) return false; storage.setItem(KEY, '1') } catch { /* storage blocked: report once per page load instead */ }
    report({ url: win.location?.pathname })
    return true
  }
}
