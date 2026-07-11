import { lazy } from 'react'

/**
 * DealMatch lazy loader - chunk retry + stale-deploy reload.
 *
 * Sentry errors fixed:
 * 1. "Failed to fetch dynamically imported module" (JAVASCRIPT-REACT-1)
 *    → Retry 3x with back-off, then hard-reload to pick up fresh deploy assets.
 *
 * 2. "Element type is invalid. Received a promise that resolves to: undefined"
 *    (JAVASCRIPT-REACT-4, JAVASCRIPT-REACT-6)
 *    → Guard: if the module loaded but has no default export, log clearly
 *      instead of letting React crash with a misleading message.
 *
 * Root cause of (2): Vite's manualChunks can occasionally produce a chunk
 * whose default export is `undefined` when the module re-exports via a
 * barrel file that itself is still being code-split. The guard below catches
 * this and retries so the correct chunk is fetched.
 */
export const lazyWithRetry = (importFn, retries = 3) =>
  lazy(() => loadWithRetry(importFn, retries))

async function loadWithRetry(importFn, retries) {
  try {
    const mod = await importFn()

    // Guard: default export must be a function (component) or object (forwardRef / memo)
    if (!mod || (typeof mod.default !== 'function' && typeof mod.default !== 'object')) {
      // Treat missing default as a chunk error and retry - it usually means
      // the barrel re-export hasn't resolved yet.
      throw Object.assign(
        new Error(`[DealMatch] Module loaded but default export is ${typeof mod?.default}`),
        { name: 'ChunkLoadError' }
      )
    }

    return mod
  } catch (err) {
    const isChunkError =
      err.name === 'ChunkLoadError' ||
      /Failed to fetch dynamically imported module/i.test(err.message) ||
      /Loading chunk .* failed/i.test(err.message) ||
      /error loading dynamically imported module/i.test(err.message) ||
      /resolve.*undefined/i.test(err.message) ||
      /default export is (undefined|object)/i.test(err.message)

    if (isChunkError && retries > 0) {
      // Exponential back-off: 0ms, 600ms, 1200ms
      await new Promise(r => setTimeout(r, 600 * (3 - retries)))
      return loadWithRetry(importFn, retries - 1)
    }

    if (isChunkError) {
      console.warn('[DealMatch] Chunk load failed after 3 retries - reloading for fresh assets')
      // Avoid a reload loop: mark the reload in sessionStorage
      const key = '_dm_reload'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
      } else {
        // Already reloaded once and still failing - clear flag, render null
        sessionStorage.removeItem(key)
        console.error('[DealMatch] Chunk still failing after reload. Rendering empty fallback.')
      }
      // Prevent React crash while reload / error state is in-flight
      return { default: () => null }
    }

    throw err
  }
}
