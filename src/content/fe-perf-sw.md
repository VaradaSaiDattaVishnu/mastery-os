A Service Worker is a JavaScript file that runs in its own thread, intercepts every `fetch` from your page, and can respond from a local cache — turning repeat visits into near-instant loads regardless of network conditions.

## The core

The Service Worker (SW) lifecycle has three phases: **install** (download and cache assets), **activate** (take control of open clients, clean old caches), and **fetch intercept** (respond to requests from the controlled page).

The SW runs in a separate thread with no DOM access and no shared state with the page. Communication is via `postMessage`. It persists across page navigations and browser sessions until updated.

```js
// service-worker.js
const CACHE_NAME = 'app-v2'
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/assets/main.js',
  '/assets/main.css',
]

// Install: precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  )
  self.skipWaiting() // activate immediately, don't wait for old SW to die
})

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim() // take control of all open tabs
})

// Fetch: cache-first for assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.pathname.startsWith('/api/')) {
    // Network-first: try network, fall back to cache
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
          return response
        })
        .catch(() => caches.match(event.request))
    )
  } else {
    // Cache-first: serve from cache, update in background (stale-while-revalidate)
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()))
          return response
        })
        return cached ?? networkFetch
      })
    )
  }
})
```

**Stale-while-revalidate** is the most practical strategy for app shell assets: serve the cached version immediately (fast), then fetch a fresh version in the background and update the cache for next time. The user gets instant load; the next visit gets the freshest content.

Registration from the main thread:

```ts
// Register SW in your app entry point
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(reg => {
    console.log('SW registered, scope:', reg.scope)
  })
}
```

## In your project

At CUBE, the 3s → 800ms improvement on repeat visits came from precaching the app shell (HTML, main JS bundle, CSS, critical fonts) and applying stale-while-revalidate to the dashboard's static reference data (department lists, product categories). The SW eliminated the network round-trip for assets that had not changed. The remaining 800ms is dominated by API calls for live data — appropriate, since that data cannot be served from cache.

## Tradeoffs & pitfalls

- **Update lag**: cache-first means users see old code until the SW activates a new version. `skipWaiting()` + `clients.claim()` forces immediate activation, but this can break in-flight requests. A gentler approach shows a "new version available" banner and prompts the user to reload.
- **HTTPS requirement**: SWs require HTTPS (or localhost). Plan your dev environment accordingly; a self-signed cert or Vite's `https` plugin is sufficient.
- **Cache size**: the Cache API has no automatic eviction. Without explicit cleanup in the activate phase, cached entries accumulate indefinitely. Always delete old caches by version name.

## Top-1% insight

The SW's `fetch` event fires for **all** requests in its scope, including cross-origin requests to your API. A naive catch-all cache strategy will cache 401 error responses, opaque responses (cross-origin with no CORS headers), and redirect chains — then serve those errors on subsequent requests. The fix: always check `response.ok` before caching, never cache opaque responses (`response.type === 'opaque'`), and set explicit URL pattern guards before caching any response.
