/**
 * Tyma PWA Service Worker
 *
 * Strategy:
 *  - API (/api/*): network-first → cache on success → serve stale on failure
 *  - Navigation:   network-first → fall back to cached index.html (SPA shell)
 *  - Static assets: cache-first  → background update
 *
 * Bump SHELL_VERSION to force all clients to re-fetch the shell on next visit.
 */

const SHELL_VERSION = 'v1'
const SHELL_CACHE   = `tyma-shell-${SHELL_VERSION}`
const DATA_CACHE    = `tyma-data-${SHELL_VERSION}`
const KEEP_CACHES   = [SHELL_CACHE, DATA_CACHE]

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.add('/'))
      .then(() => self.skipWaiting())
  )
})

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !KEEP_CACHES.includes(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin and API requests
  if (url.origin !== self.location.origin && !url.pathname.startsWith('/api')) return

  // API: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA_CACHE))
    return
  }

  // Navigation (HTML document requests): network-first, fall back to SPA shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone()
          caches.open(SHELL_CACHE).then(c => c.put(request, clone))
          return response
        })
        .catch(() => caches.match('/').then(r => r || fetch('/')))
    )
    return
  }

  // Static assets (JS, CSS, fonts, images): cache-first with network update
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
          caches.open(SHELL_CACHE).then(c => c.put(request, response.clone()))
        }
        return response
      }).catch(() => null)

      return cached || fetchPromise
    })
  )
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    return cached || new Response(
      JSON.stringify({ error: 'You appear to be offline.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
