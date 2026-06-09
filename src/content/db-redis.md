Redis is an in-memory data structure server, not just a key-value cache — the choice of structure determines your query capability, memory cost, and atomicity guarantees.

## The core

Redis stores all data in RAM using a single-threaded event loop (similar to Node.js). Each command is atomic by definition — no concurrent command interleaves with another. The server persists via RDB snapshots (point-in-time fork + write) and/or AOF (append-only file that replays commands on restart). In production, AOF with `fsync: everysec` gives durability with ~1ms latency cost.

**Core structures and their internal representation:**

| Structure | Internal encoding (small/large) | Use case |
|---|---|---|
| String | `int` / `embstr` / `raw` | Counters, session tokens, JSON blobs |
| Hash | `listpack` (≤128 fields) / `hashtable` | Object fields, user profile |
| List | `listpack` / `quicklist` | Queues, recent activity |
| Set | `listpack` / `hashtable` | Unique tags, online users |
| Sorted Set | `listpack` / `skiplist+hashtable` | Leaderboards, rate limit windows |
| Stream | Radix tree of listpacks | Event log, message queue |

Redis selects the compact encoding automatically and upgrades to the large encoding when thresholds are crossed — this matters for memory budgeting.

```bash
# String: session token with TTL
SET session:u123 '{"userId":"u123","role":"admin"}' EX 3600 NX
# EX = expire in seconds, NX = only set if not exists

# Hash: user profile — O(1) field get/set
HSET user:123 name "Vishnu" email "vishnu@example.com" plan "pro"
HGET user:123 plan
HGETALL user:123        # all fields — avoid on large hashes
HINCRBY user:123 loginCount 1

# Sorted Set: leaderboard, score = total XP
ZADD leaderboard 4200 "user:123"
ZADD leaderboard 3800 "user:456"
ZREVRANGE leaderboard 0 9 WITHSCORES   # top 10
ZRANK leaderboard "user:123"            # O(log n) rank lookup

# TTL management
TTL session:u123          # seconds remaining
PERSIST session:u123      # remove TTL (make permanent)
EXPIREAT key 1735689600   # expire at Unix timestamp
```

```bash
# Atomic counter — rate limiter skeleton
# INCR is atomic: no race condition even with many clients
INCR ratelimit:ip:192.168.1.1
EXPIRE ratelimit:ip:192.168.1.1 60   # reset window after 60s

# Set with automatic deduplication — online users
SADD online:room:42 "user:123" "user:456"
SMEMBERS online:room:42
SCARD online:room:42   # count — O(1)
SREM online:room:42 "user:123"

# List as queue: LPUSH producer, BRPOP consumer (blocking pop)
LPUSH jobs:email '{"to":"a@b.com","subject":"Welcome"}'
BRPOP jobs:email 30   # blocks up to 30s waiting for a job
```

## In your project

Order Processing and the API Gateway use Redis for two distinct jobs: session/token caching (String + TTL) and rate limiting (INCR + EXPIRE per IP/user window). The sorted set leaderboard pattern maps directly to Mongo Mastery's XP rankings — store `ZADD leaderboard <xp> <userId>` on each lesson completion and `ZREVRANK` gives a learner their position in O(log n).

## Tradeoffs & pitfalls

- **Eviction policy mismatch**: if Redis is used as both a cache and a durable store, set `maxmemory-policy noeviction` for durable data and run a separate Redis instance with `allkeys-lru` for cache-only data. Mixing them causes silent data loss when memory pressure evicts "permanent" keys.
- **Large keys**: a single key holding 10 MB of JSON blocks the event loop while serializing. A `HGETALL` on a hash with 100,000 fields is equally dangerous — both stall all other commands for that duration.
- **No transactions across keys without WATCH**: `MULTI/EXEC` batches commands atomically but cannot read a value and conditionally set another in the same transaction. Use `WATCH` + optimistic retry, or Lua scripts (which run atomically).
- **Persistence gap on restart**: with RDB-only persistence, a crash loses all writes since the last snapshot. For anything financial, use AOF or accept the data loss window explicitly.

## Top-1% insight

Redis's sorted set uses a skip list (not a B-tree) for range queries. A skip list gives O(log n) for `ZRANGE` and `ZRANK` with simpler rebalancing than a B-tree — inserts never trigger rotations. This is why `ZADD` is safe under high write throughput. However, the dual structure (skip list + hash table) means sorted sets use roughly 2–3x the memory of an equivalent hash. For very large leaderboards (millions of users), consider bucketing: one sorted set per percentile bucket rather than one global set.
