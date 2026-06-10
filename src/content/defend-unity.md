Unity is a private 15-module MERN super-app (Turborepo + pnpm monorepo) built for a devotional community — modules span meditation with ML attention scoring, task management, audio lectures, music, study courses, donations, habit tracking, residence management, social posts, contacts, a PDF studio, an AI voice assistant (Jarvis), and a dynamic form builder — all gated behind a three-tier RBAC system and sharing a single platform-agnostic `@unity/core` package that runs on both web and a Capacitor-wrapped Android app.

## Architecture

```
Monorepo (Turborepo + pnpm workspaces)
├── apps/
│   ├── web/           Vite + React 18 + Tailwind v3
│   │                  bootstraps adapters → mounts Redux store → React Router v7
│   ├── server/        Express 5 + Node.js
│   │   ├── middleware/  helmet → cors → rate-limit → xss/hpp → session → auth → rbac → validate
│   │   ├── models/    38 Mongoose models
│   │   ├── routes/    19 sub-routers (/api/tasks, /api/meditation, …)
│   │   └── jobs/      node-cron (session/invite cleanup, festival reminders)
│   ├── mobile/        React Native shell (planned)
│   ├── jarvis/        Standalone AI assistant (Groq LLaMA 3.3 70B / Claude fallback,
│   │                  Edge TTS, SQLite memory, PWA service worker)
│   └── pdf-studio/    PDF viewer/annotator (Fabric.js canvas, pdfjs, exportPdf.ts)
├── packages/
│   └── core/          @unity/core — platform-agnostic shared logic
│       ├── store/     Redux Toolkit, 17 slices (auth → reviews)
│       │              + reminderListenerMiddleware
│       ├── adapters/  StorageAdapter / AuthAdapter / NavigationAdapter
│       │              (interfaces registered at boot; web wires localStorage +
│       │               cookies; mobile wires AsyncStorage + bearer)
│       ├── api/       createApiClient() — Axios singleton, auth interceptors
│       │              resolveUploadUrl() — relative vs absolute by platform
│       └── ml/        fft.js → mfcc.js → attentionModel.js → chantingProfile.js
│                      → personalization.js (all TensorFlow.js, browser-only)
└── docs/              Obsidian vault (ADRs, module docs, data models)

Data flow:
Component → Redux thunk → getApiClient() → Express route
                                                 ↓
                             authenticate (cookie | bearer) → rbac middleware
                                                 ↓
                                         Controller → Mongoose → MongoDB Atlas
                                                 ↓
                                      JSON response → Redux slice → re-render

ML flow (Meditation module):
Mic → AudioContext → MFCC (13 + 13Δ + 13ΔΔ per frame)
    → featureWindow [40 × 39]
    → AttentionModel (1D-CNN: Conv64→Conv128→Conv64→GAP→Dense64→Dense32→sigmoid)
    → attention score 0-1
    → attentionTimeline[] stored in MeditationSession
    → only aggregate scores sent to server (raw audio stays on device)
```

## Three decisions you must justify

**Decision 1 — Modular monolith, not microservices**

The 15 modules share a single Express process and single MongoDB Atlas cluster. The rejected alternative was one service per module (15+ microservices).

Why rejected: the team is one developer; distributed tracing, service mesh, and inter-service auth overhead would consume more engineering time than the features themselves. The modules are genuinely coupled — RBAC, User, and Module records are referenced across every domain. Network hops between services for every permission check would increase latency with no offsetting benefit.

Tradeoff: a single process means one crash affects all modules, and the meditation ML inference (TensorFlow.js, browser-side) cannot independently scale from the REST API. This is intentional — all ML runs on the client, removing the server scaling concern entirely.

**Decision 2 — Platform-agnostic `@unity/core` with adapter injection**

Auth, storage, and navigation are interfaces (`AuthAdapter`, `StorageAdapter`, `NavigationAdapter`) defined in `packages/core/src/adapters/` and registered at boot time in `apps/web/src/bootstrap.js`. The Redux store, API client, and all 17 slices live in the package and run unchanged on web and on the Capacitor Android app.

Why: duplicating the Redux store and API client per platform creates two diverging codebases. The adapter pattern lets the core never `import` `localStorage`, `window.location`, or React Router — it only calls `getStorageAdapter().get(key)`.

Tradeoff accepted: there is a registration-order dependency (adapters must be wired before any slice thunk fires). If a developer adds a new thunk that calls the API before `bootstrap.js` runs, it silently uses the no-op fallback adapter. The fallback in each adapter logs a warning and returns `null` rather than crashing, but the runtime error is non-obvious.

**Decision 3 — Session-backed bearer tokens for mobile (ADR-004)**

The web app uses httpOnly session cookies (`express-session` + `connect-mongo`). When Capacitor wraps the same build for Android, `sameSite: strict` means the cookie is never sent from the WebView's `capacitor://localhost` origin. The solution: `/auth/signin` returns a JWT whose payload embeds the same `sessionId` and `userId` already written to `app_sessions`. `authenticate` middleware accepts either path; both resolve to the same `app_sessions` record, so session revocation, the active-sessions list, and password-reset invalidation cover both clients.

Rejected alternative: React Native with native networking. Cost: full UI rewrite, and TensorFlow.js + pdf.js have no drop-in native equivalents.

Tradeoff: the bearer token lives in WebView `localStorage` (not Android Keychain). A leaked token is valid until the `app_sessions` record expires. This is documented in ADR-004 as a known v1 gap; a `@capacitor/preferences` + secure-storage upgrade is the planned follow-up.

## The hardest bug

Jarvis (the AI assistant) was hallucinating tool calls — creating tasks and reminders that users never asked for. The LLM (Groq / LLaMA 3.3 70B) was inferring intent from passing mentions in conversation ("I have a meeting tomorrow" → fabricated calendar entry) and fabricating integration status (reporting Google Calendar as connected when it was not).

Root cause: the system prompt listed all available tools and integrations without constraining when the model was permitted to invoke them. LLaMA 3.3 70B is documented as more aggressive than Claude at tool-call generation, and the prompt gave it no explicit behavioral boundary.

Fix applied (`apps/jarvis/server/llm.js` and the system-prompt template): added a "CRITICAL BEHAVIORAL RULES" section at the top of the prompt — before tool definitions — stating that the model MUST NOT perform any action not explicitly requested, must ask before acting on ambiguous intent, and must not reference integrations that are not in the `[INTEGRATION STATUS]` block. The integration status block is now injected at system-prompt construction time from the actual runtime state of each service, so the model's claims are grounded in real connectivity rather than hallucinated assumption.

## What you'd change at scale

At 10x users, the first constraint to hit is the single Express process serving all 15 modules plus static file delivery. The split that pays off earliest without a full microservices migration: extract `apps/server` into two processes — an API process and a background-jobs process — so `node-cron` tasks (reminder delivery, session cleanup) are not on the same event loop as HTTP request handling.

The second change is replacing the in-memory rate limiter with a Redis-backed one. The current `globalLimiter` in `security.js` is per-process; behind a load balancer it gives each instance its own 100/15min budget, making the limit 100×N. `connect-redis` for sessions is already in `package.json`; the config module stubs the Redis connection but marks it unused in production today.

The third change is an explicit read model for cross-module queries. The global search route (`/api/search`) currently fans out to seven `Model.find()` calls in series. At scale this becomes the dominant slow path; a denormalized search index (Elasticsearch or MongoDB Atlas Search) with a change-stream sync worker would decouple read latency from write load.

The 38-model schema is the deepest structural risk. Because every model uses ObjectId references, a `User.findById` for authentication already triggers a three-level `.populate()` (`moduleAccess.module`, `moduleAccess.role`, `moduleAccess.role.permissions`). This is tolerable today; at high request concurrency it becomes a hotspot. The long-term fix is caching the resolved permission set in Redis with a TTL that matches the session TTL.

## Probing Q&A

**Q: How does RBAC scale across 15 modules without becoming a maintenance nightmare?**

The RBAC model has three layers. Platform roles (`daasa/sikshaka/bhakta`) handle coarse-grained access using `ROLE_HIERARCHY = { daasa: 3, sikshaka: 2, bhakta: 1 }` — `requireRole()` in `rbac.js` compares numeric levels, so adding a new module requires no change to the hierarchy. Module-level access is stored in `User.moduleAccess[]` as `{ module, role, additionalPermissions[], deniedPermissions[] }` tuples. `requirePermission()` resolves role permissions, appends `additionalPermissions`, then subtracts `deniedPermissions` — deny always wins. This means a new module only needs a corresponding `Module` document and seeded `Role`/`Permission` documents; the enforcement middleware is module-slug-driven and reused verbatim.

**Q: Why a shared `@unity/core` package instead of duplicating logic per app?**

Duplication would mean two Redux stores with separate auth slices, two API clients with separate interceptors, two sets of ML utilities. When the auth contract changed (adding bearer token support for mobile in ADR-004), it was one change in `packages/core/src/adapters/auth.js` and one adapter implementation in `apps/web/src/adapters/mobileAuth.js`. Had the logic been duplicated, the same change would have been required in two places with the risk of silent divergence. The adapter pattern means the core package has zero platform imports — it never touches `localStorage` or `window.location` directly.

**Q: How do you keep 38 models from becoming a big ball of mud?**

Each model maps to exactly one bounded context (module). No model references models from a different module except through the `User` aggregate root and the `Module` document (the two legitimate cross-cutting concerns). For example, `MeditationSession` holds `user: ObjectId` but not a direct reference to `Task` or `HabitLog`. Cross-domain queries go through the global search route, not through model-level joins. The docs vault (`docs/architecture/Data Models.md`) is the single source of truth and includes module ownership for each model, creating accountability for additions.

**Q: Walk me through the MFCC → attention chanting pipeline.**

The meditation session opens a `MediaStream` from the microphone. `mfcc.js` applies pre-emphasis (α=0.97), Hamming window, then calls the Cooley-Tukey FFT in `fft.js` (radix-2 iterative, pre-computed twiddle factors, O(N log N)). The power spectrum passes through a 26-band Mel filterbank, log compression, and DCT to yield 13 MFCCs per frame. The extractor appends delta and delta-delta coefficients (first and second temporal derivatives) for a 39-feature vector per frame. Every ~1.3 seconds a sliding window of 40 frames (shape `[40, 39]`) is passed to `predictAttention()` in `attentionModel.js`. If a personalized model exists in IndexedDB for the user (`unity-attention-personal-{userId}`), it is loaded first; otherwise the pre-trained model JSON is fetched from `/api/models/attention-v1/model.json`; if that also fails, the heuristic path runs. The CNN architecture is `BatchNorm → Conv1D(64,k=5) → BN → Pool → Conv1D(128,k=3) → BN → Pool → Conv1D(64,k=3) → GlobalAvgPool → Dense(64) → Dense(32) → sigmoid`. Output is a scalar 0-1. After each session, `personalization.js` fine-tunes only the two Dense layers (Conv layers frozen) for 5 epochs on the session's windows, validates against a 20% holdout, and rolls back if validation loss degrades more than 15%.

**Q: Why MERN over, say, a Go backend or a Python FastAPI backend for the ML work?**

The ML runs entirely in the browser via TensorFlow.js — there is no server-side inference. Choosing Python for the backend would add a second language and runtime for zero ML benefit. The team (one developer) is JavaScript-native; MERN keeps the full stack in one language with shared types and tooling. Express 5 added native async error propagation, which eliminates the `catchAsync` wrapper's purpose in future revisions. The cost is that Express is not strongly typed by default — the codebase uses JSDoc for documentation rather than full TypeScript, which is the acknowledged tradeoff.

**Q: Your `authenticate` middleware does a three-level `.populate()` on every request. Is that a problem?**

Yes, it is the most obvious performance bottleneck at scale. Every authenticated request calls `loadAuthedUser()` which populates `moduleAccess.module`, `moduleAccess.role`, and `moduleAccess.role.permissions` in a single chained query. For a user with access to all 15 modules this is a non-trivial document read on every request. The correct fix is to cache the resolved permission set in Redis keyed by `sessionId` with a TTL matching the session TTL, invalidating on role change. This is not implemented today; the deployment note in ADR-006 documents that Redis is provisioned but unused.

**Q: The Jarvis module uses a separate Node process and SQLite. Why not unify it with the main server and MongoDB?**

Jarvis is an experiment with a different operational profile — always-on WebSocket connections for real-time voice, a persistent local memory store, an LLM proxy that can be swapped between Groq and Anthropic at runtime. Embedding it in the main Express server would couple its failure modes (LLM API timeouts, WebSocket connection pressure) to the 15-module API. SQLite is appropriate for Jarvis's memory store because the access pattern is single-process, local, and read-heavy with small writes — MongoDB Atlas adds network latency for no gain. The JARVIS_BLUEPRINT.md documents the planned upgrade to vector embeddings (`all-MiniLM-L6-v2` via `@xenova/transformers`) for semantic memory search, which would remain SQLite-backed via `vectra`.

**Q: What happens if the TensorFlow.js model fails to load mid-session?**

`initAttentionModel()` has three priority levels. If the personalized model load from IndexedDB throws, it falls back to the server model. If the server model fetch fails (network down, missing file), it sets `usingFallback = true` and returns `{ ready: true, mode: 'heuristic' }` — it does not crash the session. `predictAttention()` checks `modelReady && !usingFallback` on every call. The heuristic path computes the same six-dimensional score (chanting quality 30%, MFCC stability 20%, rhythm regularity 20%, syllable pattern 10%, energy consistency 10%, delta smoothness 10%) using only JavaScript arithmetic — no TensorFlow dependency. The user sees a continuous attention score regardless of model availability.

**Q: How does the platform handle module enable/disable without breaking running sessions?**

`requireModuleAccess()` and `requirePermission()` both call `Module.findOne({ slug })` and check `mod.isActive` on every request. There is no cached module-active flag on the user object. This means disabling a module takes effect on the next request for every user without a cache flush or session invalidation — eventual consistency on the next API call. The tradeoff is an extra MongoDB read per module-guarded route. At the current scale this is acceptable; at high request rates the Module collection would be a candidate for a short TTL Redis cache.
