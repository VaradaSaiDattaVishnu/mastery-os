Code splitting delivers only the JavaScript needed for the current route at initial load; everything else is deferred — the discipline that controls LCP and turns a 500KB bundle into a 90KB critical path.

## The core

A bundler (Vite, webpack) starts from an entry point and follows all static imports, producing one large bundle by default. Code splitting introduces **split points** — dynamic `import()` calls that tell the bundler to emit a separate chunk, fetched lazily when the import is evaluated.

React 18's `React.lazy` and `Suspense` integrate dynamic import directly into the component model:

```tsx
import React from 'react'
import { Routes, Route } from 'react-router-dom'

// Each route chunk is only fetched when the user navigates to it
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const Analytics = React.lazy(() => import('./pages/Analytics'))
const Settings = React.lazy(() => import('./pages/Settings'))

function App() {
  return (
    <React.Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </React.Suspense>
  )
}
```

The browser fetches the route chunk only when the route renders. The `Suspense` boundary shows the fallback while the chunk downloads. The critical insight: the fallback must be a fast-rendering, statically-bundled component (a skeleton) — not another lazily loaded one.

**Bundle analysis** is the prerequisite to informed splitting. Vite's `rollup-plugin-visualizer` or webpack-bundle-analyzer produces a treemap of what is in each chunk.

```ts
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default {
  plugins: [
    visualizer({ open: true, gzipSize: true, filename: 'stats.html' }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk: third-party libs change less often → better long-term caching
          vendor: ['react', 'react-dom'],
          charts: ['recharts', 'd3'],
        },
      },
    },
  },
}
```

**LCP (Largest Contentful Paint)** is the Core Web Vital most sensitive to bundle size. LCP measures when the largest visible element (often a hero image or primary heading) is painted. A large synchronous JS bundle blocks the main thread and delays LCP even if the element's HTML is in the document. The fix: shrink the critical JS path, defer non-critical scripts, and preload the LCP image.

```html
<!-- Preload the LCP image — browser discovers it without parsing JS -->
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high" />
```

## In your project

In mongo-mastery, the pipeline visualizer and index visualizer are heavy interactive components that use D3 and custom canvas rendering. Splitting them behind `React.lazy` means the initial page load only ships the landing and query playground. Users who navigate to the visualizers download those chunks on demand — reducing the initial bundle by ~40% and improving LCP from ~3.2s to ~1.8s on a 4G connection.

## Tradeoffs & pitfalls

- **Splitting too aggressively**: very small chunks (< 10KB gzipped) create more HTTP/2 round-trips than they save. Aim for chunks > 20KB gzipped. Use `manualChunks` to group related small modules.
- **Suspense boundary placement**: a single top-level `Suspense` shows the skeleton for every navigation. Multiple nested boundaries let different regions load independently. Match boundaries to user-perceptible regions, not to component hierarchy.
- **Prefetching on hover**: for routes the user is likely to visit next, prefetch the chunk on `pointerenter` of the navigation link: `import('./pages/Analytics')` called without `await` begins the download silently.

## Top-1% insight

`React.lazy` only supports **default exports**. If a module has named exports, the lazy wrapper must re-export the default: `() => import('./Module').then(m => ({ default: m.NamedComponent }))`. More importantly, every `React.lazy` call creates a new "thenable" — the Promise is evaluated once and the result is cached. Re-creating the lazy import inside a component (inside a function body) creates a new Promise on every render, breaking Suspense's caching. Always define `lazy` calls at module scope, never inside components or hooks.
