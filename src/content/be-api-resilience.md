Resilience is the set of patterns that keep your service responding correctly when the world — network partitions, slow dependencies, traffic spikes — stops cooperating.

## The core

Four patterns compose to form a resilient service:

**1. Rate limiting** — bound how many requests a client can make in a time window. The token bucket algorithm is the standard: a client has a bucket of N tokens; each request costs 1 token; tokens refill at rate R per second. If the bucket is empty, the request is rejected with 429 and a `Retry-After` header.

**2. Timeouts** — every outbound call must have a deadline. Without one, a single slow database or downstream service holds an inbound request open indefinitely, exhausting the connection pool and cascading the failure.

**3. Retry with exponential backoff + jitter** — transient failures (5xx, network blips) should be retried, but retrying immediately with every client simultaneously causes thundering herds. Exponential backoff: wait `2^attempt * baseDelay`. Jitter: add ±30% randomness so clients desynchronize.

**4. Circuit breaker** — after N consecutive failures, open the circuit and fail fast for a cooldown window instead of hammering a broken dependency. After the window, allow one probe request (half-open state); if it succeeds, close the circuit.

```ts
// Token-bucket rate limiter with Redis (production-grade)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Request, Response, NextFunction } from 'express';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.tokenBucket(100, '15 m', 100), // 100 tokens, refill 100/15min
  analytics: true,
});

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const identifier = (req as any).user?.id ?? req.ip; // per-user after auth
  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);

  if (!success) {
    return res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      retryAfter: Math.ceil((reset - Date.now()) / 1000),
    });
  }
  next();
}
```

```ts
// Retry with exponential backoff + jitter
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 200, retryable = (e: any) => e.status >= 500 } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (!retryable(err) || attempt === maxAttempts - 1) throw err;
      // exponential backoff + ±30% jitter
      const delay = baseDelayMs * 2 ** attempt * (0.7 + Math.random() * 0.6);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// Circuit breaker — minimal implementation
type State = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private nextAttempt = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) throw new Error('CIRCUIT_OPEN');
      this.state = 'half-open';
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  private onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.cooldownMs;
    }
  }
}
```

## In your project

The Order Processing System's API gateway sits in front of 9 microservices. Without rate limiting, a single misbehaving client can exhaust the inventory service's MongoDB connection pool. Without circuit breakers on the payment service call, a Stripe API degradation cascades into all routes hanging until their timeouts fire — by which point 500 requests are queued. The gateway rate limits per-user (authenticated) and per-IP (unauthenticated), and each downstream proxy call is wrapped in a circuit breaker with a 30-second cooldown.

## Tradeoffs & pitfalls

- Rate limiting at the application layer is bypassed if you have multiple instances without shared state. Redis is the standard shared store; an in-memory limiter only works for single-instance deployments.
- Retry only transient errors (5xx, network timeout). Never retry 4xx responses — you'll retry a 400 Bad Request forever and hit the rate limit on the downstream service.
- Jitter is mandatory. Without it, all clients back off for the same duration and retry simultaneously, creating periodic spikes that overwhelm the service at regular intervals (the "thundering herd" you were trying to avoid).
- Circuit breakers should trip per-dependency, not globally. A broken payment service should not open the circuit on the inventory service.

## Top-1% insight

Timeouts must be set end-to-end: your upstream client timeout should be strictly less than your server's request timeout, which must be less than your load balancer's idle timeout. If the load balancer has a 60-second timeout and your app has no timeout on a downstream call, the user waits 60 seconds for a 504 from the load balancer — and your server has a leaked connection. The correct hierarchy: `client timeout < app downstream timeout < app request timeout < LB timeout`. Getting this right eliminates the single most common source of mysterious 502/504 errors in production.
