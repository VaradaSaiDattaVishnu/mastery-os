Caching accelerates reads by storing computed results closer to the reader; the art is knowing how close you can afford to place the cache before staleness becomes a correctness bug.

## The core

There are four distinct cache layers, each with a different eviction model and consistency guarantee:

```
Browser cache (Cache-Control, ETag)
        ↓
CDN edge (Cloudflare / CloudFront)
        ↓
App-level cache (in-process LRU, or Redis)
        ↓
Database buffer pool
```

**Cache-aside (lazy loading)**: the application checks the cache; on miss, reads from DB, writes to cache, returns. The DB is the source of truth. Cold-start penalty is one extra round-trip.

**Write-through**: every write goes to cache and DB atomically. Cache always warm; write latency doubles.

**Write-behind (write-back)**: write to cache only, async flush to DB. Highest write throughput; data-loss risk on cache crash.

**Read-through**: cache itself calls the DB on miss — the application only ever talks to the cache. Simplifies app code but ties you to the cache client.

**Cache-Control headers** are the CDN contract:
```
Cache-Control: public, max-age=86400, stale-while-revalidate=3600
```
`stale-while-revalidate` serves stale content while a background refresh runs — eliminates the thundering herd on CDN miss for popular assets.

**Hit ratio** is the only number that matters operationally. A 90% hit ratio on a 10 ms DB query means 90% of requests pay 0 ms; 95% is 50% better than 90% at the margin, not 5%. Aiming for >95% should be the default.

```
effective_latency = (1 - hit_ratio) × db_latency
90% hit, 10ms DB → 1ms avg
50% hit, 10ms DB → 5ms avg   ← 5× worse
```

## In your project

CUBE's −90% network reduction is a cache-aside pattern on server state: data fetched once is identity-stable in the client cache; invalidation fires only when a mutation succeeds. In scale-quest, caching levels demonstrate that adding a Redis layer before a saturated DB drops p99 latency without changing the DB — the lesson is that caching buys time but not infinite scale.

## Tradeoffs & pitfalls

- **Cache stampede (thundering herd)**: many requests miss simultaneously on a cold cache or after expiry, all hitting the DB at once. Mitigation: probabilistic early expiry, mutex lock on first filler, or background refresh.
- **Stale reads**: write-through and cache-aside have a window where cache and DB diverge. For financial data this is a correctness bug; use TTL=0 or read-through with strong consistency.
- **Cache poisoning**: if input parameters are part of the cache key, a crafted request can poison the cache with bad data for other users.
- **Eviction under pressure**: LRU eviction under memory pressure flushes the exact entries that were just cached — a hot-key workload thrashes the cache. Use LFU or a dedicated cache tier for hot keys.

## Top-1% insight

Invalidation on mutation is not atomic with the write unless you use a transaction or a message bus. The canonical dual-write failure: you write to the DB, then delete the cache key — if the process crashes between the two steps you have stale data in cache and no way to know. The pattern that avoids this is "cache-aside with versioned keys": the DB row carries a version number; the cache key includes the version; stale keys are simply never hit again rather than actively deleted.
