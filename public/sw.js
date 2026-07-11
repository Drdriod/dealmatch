// ✅ FIX: was cache-FIRST ("return cached || net"), which served the OLD
// site immediately on every visit and only refreshed the cache silently
// in the background for a future load - meaning a real deploy could take
// multiple reloads (or never) to actually show up on a returning visitor's
// device. This was masking real fixes as "not working" during testing.
//
// Now network-FIRST: always try the live network response first (so a new
// deploy shows up on the very next load), and only fall back to the cache
// if the network genuinely fails (offline). Cache is now purely an offline
// safety net, not the default source of truth.
const CACHE = 'dealmatch-v2'
const PRECACHE = ['/', '/index.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('/api/')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        return res
      })
      .catch(() => caches.match(e.request)) // offline fallback only
  )
})
