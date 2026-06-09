An API gateway is the single ingress point for all external traffic — it handles the cross-cutting concerns (authentication, rate limiting, routing, request aggregation) so that individual services do not have to re-implement them, and clients do not need to know the internal topology.

## The core

**What a gateway does:**
- **Authentication and authorization**: verify JWT, check RBAC policy, reject unauthenticated requests before they reach services.
- **Routing**: map external paths (`/api/orders`) to internal service addresses (`http://order-service:3000`).
- **Rate limiting**: enforce per-client quotas using token-bucket or sliding-window counters, typically in Redis.
- **Request aggregation**: one client request triggers calls to multiple services; the gateway fans out and assembles the response. This is particularly valuable for mobile clients where each extra round-trip is expensive.
- **SSL termination**: handle TLS once at the edge; services communicate over plain HTTP on the internal network.
- **Observability**: inject correlation IDs, emit access logs, record p99 latency per route.

```
Client
  │  POST /api/orders  (JWT)
  ▼
┌──────────────────────────────────┐
│           API Gateway            │
│  1. Verify JWT                   │
│  2. Rate-limit check (Redis)     │
│  3. Route to order-service       │
│  4. Inject X-Correlation-ID      │
│  5. Log request + latency        │
└──────────────────────────────────┘
         │             │
  order-service   inventory-service (aggregation)
```

**Backend for Frontend (BFF)**: a variant where each client type (mobile app, web app, third-party API) gets its own gateway that aggregates and shapes data specifically for that client's needs. Avoids the "lowest common denominator" API that serves no client well.

**Rate limiting implementation**: token bucket in Redis per client-id. At each request, decrement the bucket; if empty, return 429. The bucket refills at a fixed rate.

```js
// Sliding-window rate limiter in Redis
async function rateLimit(clientId, limit = 100, windowSec = 60) {
  const key = `rl:${clientId}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec * 2);
  if (count > limit) throw new TooManyRequestsError();
}
```

## In your project

The Order-Processing API gateway owns authentication (JWT verification, RBAC enforcement for role-based route access), rate limiting (per-user request quotas stored in Redis), and routing across all 9 internal services. No service duplicates auth logic — they trust the gateway's `X-User-ID` and `X-User-Role` headers. This is the "internal trust, external verify" pattern: validate once at the edge, propagate identity inward.

## Tradeoffs & pitfalls

- **Gateway as a monolith in disguise**: if business logic creeps into the gateway (field transformation, complex rules), it becomes a bottleneck that must be deployed whenever any service changes. Keep the gateway dumb: route, auth, rate-limit, log.
- **Single point of failure**: the gateway handles all traffic. It must be horizontally scaled and deployed with health checks. An HA pair behind a load balancer is the minimum production setup.
- **Latency addition**: every cross-cutting check (JWT verify, Redis rate-limit lookup) adds latency. A well-tuned gateway adds <2ms; a poorly tuned one can add 50ms per request.
- **Aggregation fan-out failures**: if the gateway aggregates from three services and one times out, the entire aggregated response fails. Implement fallback responses and partial results.

## Top-1% insight

The "internal trust" model (services trust X-User-ID headers from the gateway) creates a vulnerability: any internal service that is accidentally exposed externally, or any service with a bug that accepts arbitrary headers, bypasses the gateway's auth entirely. The production-grade solution is mutual TLS (mTLS) between the gateway and services — services verify that the caller is the gateway and not some other process on the network. Service meshes (Istio, Linkerd) provide mTLS transparently as a sidecar, which is why they are standard in high-security microservice deployments.
