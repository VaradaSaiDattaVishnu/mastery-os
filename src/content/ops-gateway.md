The API gateway is the single entry point for all client traffic — it validates JWT tokens, enforces RBAC, rate-limits by user, and proxies requests to the correct service, keeping every downstream service blissfully unaware of auth mechanics.

## The core

Without a gateway, every service would need to duplicate JWT validation, rate-limiting logic, and routing rules. That duplication is a security liability — one misconfigured service is a bypass. The gateway centralises all of that into one place on port 3000.

```
Client request
       │
       ▼
api-gateway :3000
  │
  ├─ 1. Rate-limit check (Redis sliding window by IP + userId)
  │       → 429 Too Many Requests if exceeded
  │
  ├─ 2. JWT verification (verify signature, check expiry)
  │       → 401 Unauthorized if invalid
  │
  ├─ 3. RBAC check (role from JWT payload vs route permission table)
  │       → 403 Forbidden if insufficient role
  │
  ├─ 4. Strip Authorization header, inject x-user-id + x-user-role headers
  │
  └─ 5. Proxy to upstream service
         POST /orders      → order-service :3002
         GET  /users/:id   → user-service  :3001
         GET  /inventory   → inventory-service :3003
         GET  /payments    → payment-service :3004
```

The gateway middleware stack is ordered intentionally — rate-limit runs before JWT so that unauthenticated flood attacks are blocked cheapest (no crypto work):

```ts
// api-gateway/src/middleware/auth.ts
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

export function verifyJWT(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) { res.status(401).json({ error: 'Missing token' }); return }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// api-gateway/src/middleware/rbac.ts
type Role = 'customer' | 'admin' | 'ops'

const routePermissions: Record<string, Role[]> = {
  'POST /orders':        ['customer', 'admin'],
  'GET /orders':         ['customer', 'admin', 'ops'],
  'DELETE /orders/:id':  ['admin'],
  'GET /admin/users':    ['admin'],
}

export function checkRBAC(req: Request, res: Response, next: NextFunction): void {
  const key = `${req.method} ${req.route?.path ?? req.path}`
  const allowed = routePermissions[key]
  if (!allowed) { next(); return }         // no restriction defined = public

  if (!req.user || !allowed.includes(req.user.role)) {
    res.status(403).json({ error: 'Forbidden' }); return
  }
  next()
}

// api-gateway/src/middleware/rateLimit.ts (Redis sliding window)
export function rateLimiter(maxRequests = 100, windowSec = 60) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rl:${req.user?.id ?? req.ip}`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, windowSec)
    if (count > maxRequests) {
      res.status(429).json({ error: 'Rate limit exceeded' }); return
    }
    next()
  }
}
```

Downstream services trust the `x-user-id` and `x-user-role` headers injected by the gateway. They do not re-validate the JWT — that would duplicate work and force every service to hold the JWT secret.

## In your project

The gateway sits at port 3000 and is the only service exposed externally in the Docker Compose setup. All other services bind to their ports within the Docker network and are not directly reachable from the host in production configuration. user-service issues JWTs; the gateway only verifies them.

The gateway does not aggregate responses (it is not a BFF). Each request maps 1:1 to one upstream service. Aggregation (e.g., an order detail page needing order + inventory + payment data) is handled by the frontend making parallel requests, or could be added as a dedicated aggregate endpoint on the gateway.

## Tradeoffs & pitfalls

**Single point of failure**: all traffic flows through the gateway. If it goes down, the entire system is unreachable. In production you would run multiple gateway instances behind a load balancer, sharing Redis state for rate-limiting.

**JWT secret management**: the gateway holds the JWT secret for verification. If the secret rotates, the gateway must be redeployed before old tokens expire. Using asymmetric keys (RS256) would let services verify tokens with the public key without the secret.

**Trusting injected headers internally**: downstream services trust `x-user-id` because only the gateway can set it (services are not exposed externally). If any service is ever accidentally exposed, an attacker can forge those headers. Mutual TLS between gateway and services closes that gap.

## Top-1% insight

Rate-limiting by userId (after JWT validation) is strictly better than rate-limiting by IP alone. IP-based limits are easy to bypass with rotating proxies and unfairly block users sharing a NAT. User-based limits are per-customer and survive IP changes. The gateway can do both in sequence: IP limit as a cheap flood guard before JWT verification, then user limit as the accurate per-account control.
