gharKa is a hyperlocal homemade-food marketplace for gated communities — a structured replacement for WhatsApp food groups. Sellers post listings with price, quantity, category, and a GPS-anchored location. Buyers browse a 5 km radius feed, place orders, coordinate pickup over a real-time chat scoped to the order, and pay offline (cash or UPI outside the app). The system is intentionally minimal: no payment gateway, no delivery, no dispute resolution in v1. The surface area is kept small so every pixel can be polished with Three.js / React Three Fiber animations and Framer Motion micro-interactions. The monorepo contains three apps — `apps/api` (Fastify + Drizzle + PostgreSQL), `apps/web` (Next.js 14 App Router), `apps/mobile` (Expo SDK 52 + Expo Router) — plus a `packages/shared` library that ships Zod schemas, TypeScript types, and utilities (including a Haversine client-side fallback) to all consumers.

## Architecture

```
 ┌────────────────────────────────────────────────────────────┐
 │              pnpm + Turborepo monorepo  (gharKa/)          │
 │                                                            │
 │  packages/shared  ──── Zod schemas, types, geo util        │
 │        ↑                   ↑               ↑               │
 │  apps/web           apps/mobile       apps/api             │
 │  Next.js 14         Expo SDK 52        Fastify 4           │
 │  App Router         Expo Router        TypeScript          │
 │  Zustand + RQ5      Zustand + RQ5      Drizzle ORM         │
 │  Three.js/R3F       Reanimated 3       PostgreSQL 16       │
 │  Framer Motion      expo-gl            PostGIS* (planned)  │
 │       │                  │                  │              │
 │  Firebase Client    Firebase Client    Firebase Admin      │
 │  SDK (phone OTP)    SDK (phone OTP)    SDK (verify token)  │
 │       │                  │                  │              │
 │  Socket.io client   Socket.io client   Socket.io server    │
 │  (/ws, JWT auth)    (/ws, JWT auth)    (fastify-plugin)    │
 │                                             │              │
 │                                       Cloudinary           │
 │                                       (image upload,       │
 │                                        signed preset)      │
 └────────────────────────────────────────────────────────────┘
 * Current schema.ts stores lat/lng as DECIMAL columns with a
   Haversine SQL expression in geo-query.ts; PostGIS ST_DWithin
   is the documented upgrade path in MASTER_ARCHITECTURE.md
```

**Runtime data flow — browse feed:**
1. Mobile calls `GET /api/listings?lat=&lng=&radius=5000`
2. `listings.service.ts` builds a `buildDistanceFilter` expression (Haversine via SQL in `geo-query.ts`) and orders by `distance ASC`
3. Drizzle executes against PostgreSQL; result includes computed `distance` field
4. TanStack Query caches the response on-device

**Runtime data flow — send message:**
1. HTTP `POST /api/messages/:orderId` persists to `messages` table, derives `receiverId` from the order row, then calls `fastify.io.to('user:<receiverId>').emit('message:new', message)` (`messages.controller.ts` line 25)
2. Socket middleware (`socket.plugin.ts`) verified the JWT before the connection was accepted; `userId` lives on `socket.data`
3. Client `useSocket` hook invalidates `['conversations']` and `['messages']` via TanStack Query on receipt

## Three decisions you must justify

**Decision 1: Phone OTP (Firebase) instead of email/password or OAuth**

- Why: Target users are Indian residential communities. Phone numbers are universal identifiers — no forgotten passwords, no email account required, no Google/Apple account dependency. Firebase Phone Auth handles OTP delivery, retry throttling, reCAPTCHA abuse prevention, and SDK-level session management on its own infrastructure.
- Rejected alternative: Twilio Verify + custom JWT — functionally identical but Twilio charges ~$0.05 per verification. Firebase is free up to 10,000 verifications/month, which comfortably covers a v1 launch. Password auth was rejected outright because the UX friction is incompatible with the target demographic.
- Tradeoff: The backend is now coupled to Firebase Admin SDK for the first hop. The architecture mitigates this by issuing its own JWT immediately after verification (`auth.service.ts` lines 36–43), so every subsequent API call is independent of Firebase — the backend can swap OTP providers without touching any non-auth code.

**Decision 2: Offline-payments-only (no payment gateway)**

- Why: Integrating Razorpay or Stripe adds PCI-DSS obligations, KYC requirements for sellers, escrow logic, refund flows, and dispute resolution — all of which are out of scope for a hyperlocal trust-based community. Neighbours collecting cash or scanning a UPI QR at pickup is the norm in the target context. Removing payments from the app removes the single most complex, regulated, and failure-prone subsystem.
- Rejected alternative: Razorpay Payment Links auto-generated on order placement.
- Tradeoff: The platform cannot enforce payment, cannot offer buyer protection, and cannot monetise via transaction fees in v1. The order status machine (`PLACED → CONFIRMED → READY → PICKED_UP → COMPLETED`) serves as the coordination layer without touching money.

**Decision 3: Drizzle ORM over Prisma (or raw SQL)**

- Why: Drizzle is a thin type-safe SQL builder with no runtime query engine binary. The schema in `apps/api/src/db/schema.ts` is plain TypeScript with Drizzle column helpers — migrations are plain SQL files checked into the repo. When geo queries require raw SQL (Haversine expressions in `geo-query.ts`, or the `DISTINCT ON` conversation query in `messages.service.ts`), Drizzle's `sql` template literal drops cleanly into typed queries without breaking the type chain.
- Rejected alternative: Prisma — generates a binary query engine (~40 MB), complicates Docker images, and its PostGIS support requires raw query escapes that lose type safety. Raw SQL was rejected because it offers no compile-time safety on column names or return types.
- Tradeoff: Drizzle has a smaller ecosystem and less "magic" than Prisma. Complex relational queries (e.g., the `getConversations` DISTINCT ON in `messages.service.ts`) must be written as raw `db.execute(sql`...`)` rather than using a relational API, which raises the SQL literacy bar for contributors.

## The hardest bug

**Haversine geo-query inaccuracy at bounding box edges.** The current `buildDistanceFilter` in `apps/api/src/utils/geo-query.ts` uses spherical law of cosines via `acos(cos·cos·cos + sin·sin)` with a `LEAST(1.0, GREATEST(-1.0, ...))` clamp to guard against floating-point domain errors in `acos`. Without that clamp, any row where the dot product rounds to 1.000000001 due to floating-point arithmetic causes `acos` to receive an out-of-domain value and return `NaN`, which PostgreSQL silently treats as a non-match — listings disappear from the feed near the exact centre of a query. The clamp (`LEAST(1.0, GREATEST(-1.0, ...))`) was added in `geo-query.ts` lines 5–11 to prevent this. A secondary issue: because `latitude` and `longitude` are stored as `DECIMAL(10,7)` strings (not a PostGIS GEOGRAPHY column), PostgreSQL must call `radians(latitude)` on every candidate row — there is no spatial index to eliminate rows before the trig computation. At scale this becomes a full-table trig scan. The documented upgrade path (MASTER_ARCHITECTURE section 8) is to add PostGIS, change the columns to `GEOGRAPHY(POINT, 4326)`, and replace the Haversine expression with `ST_DWithin` + a GIST index.

## What you'd change at scale

- **Geo column type**: Replace `DECIMAL(10,7)` latitude/longitude with a single PostGIS `GEOGRAPHY(POINT, 4326)` column on `food_listings` and add a GIST index. `ST_DWithin` with a GIST index reduces the 5 km query from a full-table trig scan to an indexed bounding-box pre-filter followed by a precise geodesic check. At 100k listings this is the difference between 800 ms and 8 ms.
- **Socket.io horizontal scaling**: The current Socket.io server is a single Node.js process. Adding a second API instance breaks `fastify.io.to('user:<id>')` because that user's socket may be on the other instance. The fix is `@socket.io/redis-adapter` — all instances share a Redis pub/sub channel so `emit` fans out correctly.
- **Refresh token table pressure**: Every login and every token rotation inserts a row into `refresh_tokens`. Long-running apps accumulate millions of rows. Add a scheduled job to `DELETE FROM refresh_tokens WHERE expires_at < NOW()` or set PostgreSQL table partitioning on `expires_at`.
- **Image delivery**: Cloudinary handles transforms and CDN today. At volume, evaluate moving to Cloudflare Images or self-hosted imgproxy behind R2 to eliminate per-transformation costs.
- **Order quantity race condition**: `orders.service.ts` reads `availableQuantity`, checks it, then decrements in a transaction — but the check and the transaction open are two separate round trips. Under concurrent requests, two buyers could both pass the availability check before either commits. The fix is `UPDATE food_listings SET available_quantity = available_quantity - $qty WHERE id = $id AND available_quantity >= $qty RETURNING id` — one atomic statement that returns 0 rows if quantity is exhausted.

## Probing Q&A

**Q: How do you query listings within 5 km efficiently?**
The `listNearby` function in `listings.service.ts` calls `buildDistanceFilter(lat, lng, radiusMeters)` from `geo-query.ts`. That function emits a Haversine expression using PostgreSQL trig: `6371000 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(lng)) + sin(radians(lat)) * sin(radians(latitude)))))`. Rows where this value exceeds `radius` are filtered out. Additional conditions on `isActive`, `expiresAt > NOW()`, and `availableQuantity > 0` are ANDed in. Results are ordered `distance ASC`. The LEAST/GREATEST clamp prevents a floating-point domain error in `acos`. The known limitation is that `latitude` and `longitude` are DECIMAL columns — no spatial index. The upgrade to PostGIS `ST_DWithin` with a GIST index is the documented next step.

**Q: Why phone OTP and not passwords?**
Passwords introduce a forgotten-password recovery flow, password-reset emails, hashing policy decisions, and a whole new attack surface (credential stuffing, brute force). The target market — residents of Indian gated communities — universally owns a phone and is already habituated to OTP login (every bank, food delivery app, and payment app uses it). Firebase Phone Auth delivers the OTP, handles rate limiting and reCAPTCHA, and gives us a signed `firebaseIdToken` that the backend verifies once with `auth.verifyIdToken()` in `auth.service.ts` line 15. After that single verification, gharKa issues its own JWT pair and is independent of Firebase for all subsequent calls.

**Q: Why no payment gateway?**
The decision is documented explicitly in MASTER_ARCHITECTURE section 1: adding a gateway brings PCI-DSS compliance, KYC for sellers, escrow logic, refund flows, and dispute resolution — each a multi-week project. The social contract of a gated community (you know your seller; cash or UPI at pickup is normal) means the trust problem is already solved. Removing payments removes the most complex, regulated subsystem in the product and lets v1 ship faster. The order state machine (`PLACED → CONFIRMED → READY → PICKED_UP → COMPLETED`, enforced by `canTransition` in `packages/shared/src/constants/order-status.ts`) provides coordination without touching money.

**Q: How does the real-time chat scale?**
Messages are persisted first via `POST /api/messages/:orderId` → `messages.service.ts:sendMessage` → Drizzle insert. After the insert succeeds, `messages.controller.ts` line 25 calls `request.server.io.to('user:<receiverId>').emit('message:new', message)`. The Socket.io server authenticates every connection in the middleware at `socket.plugin.ts` lines 24–36 by verifying the JWT from `socket.handshake.auth.token`. If the receiver is offline, they fetch missed messages on reconnect via the REST endpoint. The current single-process limit is solved at scale by adding `@socket.io/redis-adapter` — a pub/sub adapter that lets multiple API instances share socket rooms.

**Q: Why a monorepo for api/web/mobile?**
`packages/shared` contains the Zod schemas (`listing.schema.ts`, `order.schema.ts`, `auth.schema.ts`), TypeScript types, the `canTransition` order-status machine, and the `haversineDistance` client-side utility. Any change to, say, the `CreateListingInput` schema is a single commit that immediately fails the TypeScript build in all three apps if any app is out of sync. Without the monorepo, schema drift between the mobile app and the API is caught at runtime in production. Turborepo's pipeline (`turbo.json`) ensures `packages/shared` is built before any app that depends on it, and `pnpm` hoists shared devDependencies to eliminate version skew.

**Q: What is the order-scoped chat design and why?**
Chat is not a general messaging system. A conversation is an order: `messages.orderId` is a non-nullable foreign key to `orders`. When a buyer places an order, the chat thread implicitly exists — the `orderId` is the conversation ID. `sendMessage` in `messages.service.ts` verifies that the sender is either the `buyerId` or `sellerId` of that order before inserting. This prevents strangers from DMing sellers, eliminates spam, and gives every message a business context (which listing, which quantity, which status). The tradeoff is that buyers and sellers cannot chat before an order exists — an intentional constraint that enforces commitment before contact.

**Q: How does token refresh work and what prevents replay attacks on refresh tokens?**
Access tokens expire in 15 minutes (`signAccessToken` uses `{ expiresIn: '15m' }` in `jwt.ts`). Refresh tokens last 7 days. Only the SHA-256 hash of the refresh token is stored in `refresh_tokens.tokenHash` — the raw token is never persisted. On `POST /auth/refresh`, `refreshAccessToken` in `auth.service.ts` hashes the incoming token, looks it up, verifies it has not expired, then immediately deletes that row (`db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id))`) before issuing a new pair. This is refresh token rotation: each use of a refresh token burns it. If an attacker steals and uses a token before the legitimate client does, the next legitimate refresh attempt will fail — signalling a potential token theft.

**Q: How is the admin role assigned and why is it not stored as a permanent DB flag?**
Admin role assignment happens at login time in `auth.service.ts` lines 28–30: `const adminPhones = env.ADMIN_PHONE_NUMBERS.split(','); const role = adminPhones.includes(phone) ? 'ADMIN' : 'BUYER'`. The `role` column on the `users` table is set to `ADMIN` only if the phone is in the environment variable at the moment of account creation. This means revoking admin access is as simple as removing the phone from the env var and the user's next login re-evaluates — no database surgery required. The tradeoff is that the admin list lives in deployment config, not a UI, so adding an admin requires a redeploy.
