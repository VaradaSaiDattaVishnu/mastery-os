REST is a set of architectural constraints — uniform interface, statelessness, resource-orientation — not a protocol; conforming to them makes APIs predictable and cacheable at every layer.

## The core

**Resources, not actions.** A URL identifies a noun (`/orders/42`), not a verb (`/getOrder?id=42`). HTTP methods carry the verb semantics:

- `GET` — read, safe, idempotent, cacheable
- `POST` — create or trigger; not idempotent
- `PUT` — full replace; idempotent
- `PATCH` — partial update; idempotent by convention
- `DELETE` — remove; idempotent

**Status codes are part of the contract.** Using 200 for every response and hiding errors in the body breaks caches, reverse proxies, and client retry logic.

| Scenario | Code |
|---|---|
| Created resource | 201 + `Location` header |
| Async job accepted | 202 |
| Empty success | 204 (no body) |
| Validation error | 422 (or 400) |
| Auth missing/bad | 401 |
| Auth valid but forbidden | 403 |
| Not found | 404 |
| Conflict (duplicate) | 409 |
| Rate limited | 429 + `Retry-After` |
| Server error | 500 |

**Idempotency** means calling an operation N times has the same effect as calling it once. `PUT /orders/42` with the same body must produce the same state each time. For `POST` (non-idempotent), clients pass an `Idempotency-Key` header; the server deduplicates using that key.

```ts
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// GET with cursor pagination — never use OFFSET at scale
router.get(
  '/orders',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const after = req.query.after as string | undefined; // opaque cursor

    const { items, nextCursor } = await orderService.list({ limit, after });

    res.json({
      data: items,
      pagination: {
        limit,
        nextCursor,          // null when no more pages
        hasMore: !!nextCursor,
      },
    });
  })
);

// POST with idempotency key
router.post(
  '/orders',
  asyncHandler(async (req: Request, res: Response) => {
    const key = req.headers['idempotency-key'] as string;
    if (!key) return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED' });

    const existing = await idempotencyStore.get(key);
    if (existing) return res.status(existing.status).json(existing.body);

    const order = await orderService.create(req.body);
    const response = { data: order };

    await idempotencyStore.set(key, { status: 201, body: response }, '24h');
    res.status(201).location(`/orders/${order.id}`).json(response);
  })
);

// Versioning via URL prefix — most operationally safe option
// app.use('/api/v1', v1Router);
// app.use('/api/v2', v2Router);
```

## In your project

Every service in the Order Processing System exposes a REST API. The gateway enforces idempotency keys on `POST /orders` so that a payment retry (common under network flakiness) doesn't create duplicate orders — the saga's inventory reservation and payment charge are both gated on this key. Without it, a client retry during a timeout window could charge a user twice.

## Tradeoffs & pitfalls

- **OFFSET pagination** at large offsets is O(offset) in most databases — at page 500 with limit 20, the DB scans 10,020 rows and discards 10,000. Keyset (cursor) pagination is O(1) after the index seek.
- **URL versioning** (`/v1/`) breaks bookmarks and caches but is operationally simple. **Header versioning** (`Accept: application/vnd.api+json; version=2`) is cleaner but harder to route and debug. Pick one and be consistent.
- Returning 200 with `{ success: false }` poisons every CDN and HTTP client that checks the status code. Never do it.
- `PATCH` is not idempotent if the body describes a delta (`+10` instead of `10`). Document semantics explicitly.

## Top-1% insight

HTTP caching is free performance that most APIs leave on the table. `GET /products/42` can carry `Cache-Control: max-age=60, stale-while-revalidate=30` — CDNs and browsers serve the cached copy for 60 seconds, then revalidate in the background for another 30. A 404 response should also be cached (`Cache-Control: max-age=5`) to stop thundering-herd storms when a bad URL is hammered. The prerequisite is correct status codes: caches only apply these rules to 200, 301, 404 by default. Getting the status codes right is step zero for every caching win downstream.
