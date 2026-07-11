const CACHE_NAME = 'dealmatch-v1'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// Fetch — network first, cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET and non-http requests
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith('http')) return

  // Skip Supabase, Google, Paystack API calls — always go to network
  const url = new URL(event.request.url)
  const skipDomains = ['supabase.co', 'googleapis.com', 'paystack.com', 'pinecone.io', 'posthog.com', 'sentry.io']
  if (skipDomains.some(d => url.hostname.includes(d))) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/')
          }
        })
      })
  )
})

// Push notifications (future use)
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'DealMatch', {
      body:  data.body || 'You have a new notification',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data:  data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  )
})
