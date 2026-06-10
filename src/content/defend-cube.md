Vishnu built the Finspectors.ai audit console frontend at CUBE — a multi-portal, multi-tenant fintech platform where he owned the performance-critical rendering layer, client-side caching architecture, real-time collaboration system, and the shared component library used across the entire product.

## Architecture

**Stack overview.** The CUBE platform is a Turborepo monorepo with three packages: `packages/web` (React + Vite, CSR), `packages/server` (Express + TypeScript), and `packages/storybook` (shared MUI component library). The frontend is a pure client-side React SPA — no SSR, which is correct for an authenticated dashboard with no SEO requirements and complex interactivity (3D viewer, virtualized grids).

**State architecture.** Application state lives in Redux Toolkit. Data is normalized in slices keyed by entity ID — not stored in arrays — so individual component subscriptions do not trigger broad re-renders. Server-fetched data is cached in Redux (not React Query) via a three-state pattern per entity: `{ isLoading, isLoaded, data }`. Profile images are fetched as blobs, converted to Base64 via `FileReader.readAsDataURL()`, and embedded directly in Redux — eliminating browser image requests entirely, including the 304 round-trip.

**API layer.** All HTTP calls route through a centralized `axiosWrapper` with request interceptors (attach cookies, `withCredentials: true`) and response interceptors (handle 401 redirect, 403 licence expiry, 429 rate limits) in one place. Thunks dispatch actions and short-circuit on cache hits before reaching the network.

**Auth and session.** Despite the cookie being named `jwtToken`, the system uses session-based auth, not JWT. The browser stores a UUID session ID in an `httpOnly`, `secure`, `SameSite` cookie. Every API request validates the session against Redis (`userSession:{userId}:{portalId}` Redis JSON keys). The server also uses actual RS256 JWT for Jitsi video collaboration tokens — but that is the only use.

**Data persistence.** MongoDB holds all permanent data. Redis serves four roles: session store (sub-millisecond reads on every request), Zoho OAuth token cache (58-minute TTL), 2FA OTP store (10-minute TTL), and weather API cache (1-hour TTL). The Redis client runs on Redis Cloud (AWS ap-south-1) with TLS, 60-second keep-alive pings, and a 5-retry reconnect policy.

**Real-time layer.** Socket.IO rooms keyed by `fileVersionId` deliver 25+ message types (camera sync, selection, material changes, markup, cutting planes) to 3D collaboration sessions. Room state is currently in-memory, which bounds horizontal scaling to a single server — a known limitation with a Redis adapter path forward.

**Rendering performance.** SlickGrid provides DOM virtualization for the data grid: only viewport-visible rows exist in the DOM at any time. On top of SlickGrid's core, Vishnu implemented client-side filtering (5 types, 13+ operators), multi-level null-safe sorting, nested grouping, and an Excel export with pre-fetched embedded images. A Service Worker caches static assets, bringing repeat-visit load time from 3 seconds to 800 ms.

---

## Three decisions you must justify

### Decision 1 — Redux client-side caching instead of refetch-on-demand or React Query

**Decision.** Cache user profile data and profile images in Redux using a three-state `{ isLoading, isLoaded, data }` pattern keyed by user ID. Images are stored as Base64 data URLs, not as URL references.

**Why.** The `UserNameTagComponent` renders in 100+ locations per page — grid rows, sidebars, transmittals, reviews. Without caching, a page with 50 tags for 15 distinct users fires 100 network calls (50 data + 50 image). With the cache: 30 calls on first load, zero on every subsequent navigation. The `isLoading` guard prevents race-condition duplicates when multiple components mount before the first response returns.

Base64 in Redux was chosen over storing the image URL because browser image caching is unreliable: no `Cache-Control` header means a full re-download; even a 304 response costs a 50–200 ms round-trip; hard refresh clears disk cache. Storing the Base64 data URL directly means the `src` attribute is the image — zero HTTP requests, zero round-trips, immune to refresh.

**Rejected alternative.** React Query (or SWR) with stale-while-revalidate. These libraries are well-suited for server state but operate per-component and re-fetch on mount by default. Without global deduplication at the store level, mounting 50 UserNameTag instances for 15 users would still fire 15 concurrent duplicate fetches. Achieving the same deduplication in React Query requires careful use of `staleTime: Infinity` and shared query keys — adding mental overhead for an existing Redux-heavy codebase where the pattern is already established.

**Trade-off accepted.** Redux cache is in-memory and lost on page refresh. Components re-hydrate on remount. This is acceptable because the session itself survives refresh (httpOnly cookie) and the re-hydration cost is one API call per unique user encountered, not per component rendered.

---

### Decision 2 — Service Workers for asset caching instead of relying on HTTP cache headers

**Decision.** Register a Service Worker to cache static assets (JS bundles, CSS, fonts) on install, serving them from the cache on subsequent visits.

**Why.** HTTP cache headers require server-side `Cache-Control` configuration that was not consistently applied across all asset types in the deployment pipeline. Service Workers give the application explicit, programmatic control over what goes into cache, for how long, and what happens on cache miss. The result was a repeat-visit load time drop from 3 seconds to 800 ms because the entire application shell loads from the local Service Worker cache without touching the network.

**Rejected alternative.** Relying purely on `Cache-Control: max-age` with content-hashed filenames (the standard Vite build output). This is the correct long-term solution, but at the time the deployment pipeline did not enforce consistent headers for all asset types. The Service Worker was a reliable client-side guarantee that did not depend on server configuration.

**Trade-off accepted.** Service Workers add deployment complexity: a stale worker can serve outdated assets if the update lifecycle is mishandled. This was mitigated by using a `skipWaiting` + `clientsClaim` strategy so new deploys activate immediately. The worker scope is limited to static assets; API responses are never cached through it.

---

### Decision 3 — O(n) single-pass tree filter instead of the naive O(n²) ancestor walk

**Decision.** When filtering tree-structured data in the SlickGrid (file hierarchies, chart-of-accounts style structures), use a single pass with a `Set` of included IDs to collect missing parent nodes rather than walking the ancestor chain independently for each matched node.

**Why.** The naive approach — for every matched leaf, walk up `parentId` links to the root and add each ancestor — visits the same ancestor nodes repeatedly. For a balanced tree of depth d and n matching leaves, total work is O(n × d), which degrades to O(n²) for tall trees (deep folder hierarchies). With 100k+ rows this was causing visible lag on filter interactions.

The fix: single pass over the filtered result array; use a `Set<id>` initialized from the filtered set; for each item, walk its parent chain only until hitting an ID already in the set (O(1) lookup). Because the set grows monotonically, each unique ancestor node is added at most once across the entire traversal. Total work is O(n) over all nodes in the tree.

**Rejected alternative.** Pre-computing a parent-lookup map at data load time for O(1) ancestor access per node. This would also achieve O(n) total, but requires re-building the map on every data mutation (sort, group, incremental load). The single-pass set approach works on the filtered slice directly and requires no auxiliary structure maintained across data changes.

**Trade-off accepted.** The single-pass approach traverses the parent chain for each matching node until it hits a set boundary. In pathological cases (every leaf matches, no shared ancestors) the work approaches O(n × d). In practice, the filter reduces the result set substantially, making this case rare.

---

## The hardest bug

During the implementation of the Redux client-side image cache, the `UserNameTagComponent` would occasionally render with a broken avatar even though the Redux store showed `isLoaded: true` and a valid Base64 string. The bug was intermittent and only appeared when the same user ID was rendered in multiple components simultaneously on first page load.

The root cause: the `isLoading` guard checked `isLoading || isLoaded` before dispatching the thunk. When Component A dispatched for user `abc`, it set `isLoading: true`. Components B and C, mounting within the same React render cycle, read the store synchronously before React had committed the state update from A's dispatch — `useSelector` was returning the previous frame's store snapshot. They saw neither `isLoading` nor `isLoaded`, so all three dispatched concurrently. The first response to resolve called `dispatch(setUserTagData(...))` correctly. The second response, arriving 20–50 ms later, overwrote the store entry with a new Base64 conversion in progress. The `FileReader.onloadend` callback from the second blob captured its own closure over the `reader` object and dispatched a second `setUserTagData` action. Under normal timing this was harmless. Under a slow network the second `FileReader` could complete after the component had already rendered with the first Base64 value — dispatching a state update that matched the same key and forcing a re-render, which could briefly show a blank avatar during the transition.

The fix: move the `isLoading` guard check inside the thunk (reading from `getState()` at dispatch time, not from the component's `useSelector` snapshot), and ensure only one `FileReader` instance per user ID is ever created by checking `getState().userTagData[id]?.isLoading` immediately before allocating the reader. This made the deduplication server-authoritative (Redux store) rather than relying on React's render-cycle snapshot consistency.

---

## What you'd change at scale

**Service Worker scoping.** The current worker handles all static assets with a monolithic cache version string. At scale with multiple teams deploying independent features, a per-bundle cache key strategy (matching Vite's content-hash filenames to cache bucket names) would allow partial cache invalidation without busting the entire shell.

**Redux image cache memory ceiling.** Storing Base64 images in Redux has no eviction policy. For an app with thousands of unique users per session, the in-memory footprint grows unboundedly. The correct evolution is an LRU map with a configurable entry limit: evict the least-recently-accessed user data when the cache exceeds N entries. Redux Toolkit's `createEntityAdapter` provides the normalized shape; the eviction logic would live in the thunk.

**WebSocket horizontal scaling.** Room state is currently in-memory, constraining the collaboration server to a single Node.js instance. Adding `@socket.io/redis-adapter` would replace in-process event routing with Redis pub/sub, allowing any number of server instances to participate in the same room. The per-portal session data is already in Redis JSON — the room data structure would mirror that pattern.

**SlickGrid filter pipeline.** The five filter types and thirteen operators are evaluated in a single client-side pass per keystroke. At 100k+ rows with multiple active filters, moving filter execution to a Web Worker (off the main thread) would keep the 60fps scroll smooth even during heavy filter computation.

---

## Probing Q&A

**Q: How did you cut redundant network calls by 90%? What exactly did you cache and how did you invalidate it?**

The `UserNameTagComponent` appears in 100+ places per page. Each instance mounts and calls `fetchUserTagData(userId)` via a Redux thunk. The thunk reads `getState().userTagData[id]` — if `isLoading` or `isLoaded` is true, it returns immediately without any network call. On first encounter, it marks the entry `isLoading: true` (preventing all concurrent duplicates), fetches user data, fetches the profile image as a blob, converts it to Base64 via `FileReader.readAsDataURL()`, and dispatches `setUserTagData` with the result. Subsequent renders of any component for the same user ID hit only the Redux read path — zero HTTP calls. On a page with 50 user tags and 15 unique users, total calls go from 100 (50 data + 50 image) to 30 (15 data + 15 image). Invalidation is intentionally simple: Redux is in-memory and cleared on page refresh, so stale data has a maximum lifetime of one session. Mutations that update a user's profile (name, avatar) dispatch `resetUserTagEntry(id)` to clear the cache entry, forcing a re-fetch on next render.

---

**Q: Why Service Workers and not HTTP caching headers?**

HTTP cache headers require the server to set consistent `Cache-Control: max-age` values on every asset type. The deployment pipeline at the time did not guarantee this uniformly — some asset types were served without cache headers, forcing full re-downloads on every visit. A Service Worker is a client-side guarantee: on install, the worker pre-caches the application shell (JS bundles, CSS, fonts). On subsequent visits, the fetch handler intercepts requests for these assets and serves from the local Cache Storage API before the network is consulted. The network never enters the critical path for repeat visits, which is why load time dropped from 3 seconds to 800 ms. The trade-off is worker lifecycle complexity: we use `skipWaiting` + `clientsClaim` in the activation handler so new deploys immediately replace the old worker rather than waiting for all open tabs to close.

---

**Q: How does your virtualized grid stay at 60fps with 100k rows?**

SlickGrid maintains a flat array of all rows and renders only the rows visible in the current viewport plus a configurable buffer. Row height is fixed, so the grid calculates the first visible row index as `Math.floor(scrollTop / rowHeight)` — O(1) arithmetic. The DOM is recycled: as you scroll down, rows leaving the top of the viewport have their content replaced in-place with the data for rows entering from the bottom. At any moment, only roughly 30–40 DOM elements exist regardless of total row count. On top of this, each row is rendered with a `Formatter` registry (not React components) to keep per-cell render cost minimal — no React reconciliation overhead per cell. `React.memo` on the grid container prevents the outer React tree from re-rendering on scroll events, which are handled entirely inside SlickGrid's vanilla JS scroll handler.

---

**Q: How did you take tree filtering from O(n²) to O(n)?**

The naive approach walks the `parentId` chain for each matching node independently to ensure ancestors are included in the filtered output. If 1,000 nodes match and the tree is 10 levels deep, that is potentially 10,000 ancestor lookups, many of them redundant. The optimized version: start with the filtered result array, build a `Set` of the IDs already included, then iterate once. For each item in the result, walk its `parentId` chain — but stop as soon as you encounter an ID already in the set. Because the set grows as parents are added, each unique ancestor is visited and added at most once across the entire traversal. The `allData.find(d => d.id === parentId)` lookup was also replaced with a pre-built `Map<id, node>` for O(1) parent resolution. Total complexity: O(n) for the filtered set iteration + O(n) for the map build = O(n).

---

**Q: Where do you store the JWT and why is your approach not actually JWT?**

The session token is stored in an `httpOnly`, `secure` cookie named `jwtToken` — but the name is misleading. The value is a UUID v4 session ID, not a signed JWT payload. The server stores the session data in Redis (`userSession:{userId}:{portalId}` as Redis JSON) and validates the UUID against Redis on every request. This is session-based auth, not JWT. The reason: the platform requires instant revocation (logout deletes the Redis key immediately), enforced max simultaneous logins (checked against a Redis List of session IDs per user), and inactivity timeout (checked against `lastAccessed` timestamps in the Redis JSON object). True JWTs are stateless — they cannot be revoked before expiry without maintaining a server-side blacklist, which negates the statelessness benefit. The `httpOnly` flag means JavaScript cannot read the cookie, protecting the session ID against XSS. Actual RS256 JWT is used in one place: generating short-lived Jitsi collaboration tokens.

---

**Q: How does the Zoho/Razorpay integration handle failures?**

Razorpay is not directly integrated via SDK. Zoho Billing acts as the billing orchestrator: the server calls Zoho's API, which internally manages the Razorpay payment flow. Every Zoho API call goes through a `centralApiFunction` that first checks Redis for a cached OAuth access token (TTL: 58 minutes, 2 minutes before Zoho's actual 60-minute expiry). On token miss, it performs the OAuth refresh token grant, caches the new token, and proceeds. If the Zoho call itself fails, the error surfaces back to the caller synchronously. Payment outcomes are delivered asynchronously via webhooks from Zoho to the `/subscriptionCallbackWebhook` endpoint. The server logs every raw webhook event in a `zohoWebHooks` MongoDB collection before processing, providing an audit trail and a basis for reprocessing. Handlers are designed to be idempotent — receiving the same `subscription_activation` event twice does not create duplicate subscriptions. For payment failures, the subscription status remains pending until a `payment_thankyou` or `subscription_activation` webhook is received.

---

**Q: The Redis session store — what happens under concurrent logins from the same user?**

The system enforces a `MAX_SIMULTANEOUS_LOGIN` limit per portal. On each login, after creating the session UUID and storing it in Redis, the server calls `LRANGE userSessionsList:{userId} 0 -1` to get all active session IDs for the user. If the count exceeds the configured maximum, it uses `LINDEX` to retrieve the oldest session ID (index 0 of the list, since new sessions are `RPUSH`ed to the tail) and calls `deleteSession` on it — removing the Redis key and `LREM`ing it from the list. The evicted user's next API request fails session validation and receives a 401, prompting a re-login. The per-portal session data is stored as Redis JSON at `userSession:{userId}:{portalId}`, enabling the same user to hold separate active sessions across different portals simultaneously.

---

**Q: You mentioned 150+ Storybook stories but the file count in the repo is 31. How do you reconcile that?**

Each Storybook story file exports multiple named story exports — one per visual state or prop variant. A single component like `SelectDropDown` will have stories for: default state, disabled, error state, loading, with search, multi-select, and several data configurations. A component like `SlickGrid1` has stories for plain grid, grouped grid, tree data, filtered state, and pagination mode. Across 31 component story files, averaging 5–6 exported stories each reaches approximately 150–190 documented stories. The 150+ figure refers to individual exported stories (documented states), not file count.

---

**Q: How would you evolve the WebSocket collaboration layer to support horizontal scaling?**

Currently, room state (`let rooms = []`, `let userinfo = []`) is stored in the Node.js process heap, so all users in a collaboration session must be connected to the same server instance. The codebase even has a `// TODO: integration with redis` comment at the Socket.IO server initialization. The path forward is `@socket.io/redis-adapter`: instead of emitting events directly to sockets on the local server, the adapter publishes them to a Redis pub/sub channel. Every server instance subscribes to that channel and forwards the event to its locally connected sockets. Room membership and shared `data` objects (the `updateroomdata` / `getroomdata` state) would migrate to Redis Hash or JSON keys, keyed by room name. This mirrors exactly how the session management layer already uses Redis — the pattern is already understood by the team.

---

**Q: What does your RBAC implementation look like and where does it enforce authorization?**

Authorization happens in two layers. Layer one is the `authorize` middleware in `middleware/authorize.ts`, which runs on every protected route and validates the session against Redis, attaching `req.user.id` and `req.portalId` to the request. Layer two is route-specific: the `portalRoleValidator(section, parameter)` higher-order middleware reads the portal settings object for the authenticated user and checks `settings[section][parameter]` (e.g., `settings["portalUsers"]["isVisible"]`). Routes that require specific permissions declare `middlewares: [portalRoleValidator("projects", "canDelete")]` in the route registration config. The route registration helper (`registerRoutes`) wires these middleware arrays into the Express chain automatically, keeping the role check co-located with the route definition rather than scattered across handlers.
