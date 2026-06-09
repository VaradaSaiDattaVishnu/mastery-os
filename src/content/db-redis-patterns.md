Cache-aside, write-through, pub/sub, and distributed locks are the four patterns that cover 95% of Redis production usage — each makes a different trade-off between consistency, latency, and complexity.

## The core

**Cache-aside (lazy loading)**: the application checks the cache first; on miss, reads from the database, writes to the cache, returns. The cache only holds data that has been requested — memory-efficient, but cold starts cause a stampede (many concurrent misses hitting the database simultaneously).

**Write-through**: writes go to the cache and database synchronously. Every cached key is always warm; the cost is double-write latency on every mutation and wasted cache space for data that is never read.

**Write-behind (write-back)**: writes go to cache immediately, the database is updated asynchronously. Lowest write latency; highest durability risk — a Redis crash before flush loses data.

**Pub/Sub vs Streams**: `PUBLISH`/`SUBSCRIBE` is fire-and-forget (no persistence, no consumer groups). Redis Streams (`XADD`/`XREADGROUP`) are a durable, consumer-group-aware message log — the right tool when you need at-least-once delivery.

**Distributed lock (Redlock)**: use `SET key value NX PX <ms>` for a single-instance lock. Redlock (acquire on N/2+1 instances) extends this to clustered Redis — but Martin Kleppmann's critique stands: clock drift can cause two clients to hold the lock simultaneously. Use fencing tokens for truly safety-critical locks.

```js
// Cache-aside with stampede protection (probabilistic early expiry)
async function getLesson(id) {
  const cached = await redis.get(`lesson:${id}`)
  if (cached) return JSON.parse(cached)

  // Cache miss — fetch from MongoDB
  const lesson = await db.lessons.findOne({ _id: id })
  if (!lesson) return null

  // Store with TTL; add small random jitter to prevent mass expiry at same time
  const ttl = 300 + Math.floor(Math.random() * 60) // 5–6 minutes
  await redis.set(`lesson:${id}`, JSON.stringify(lesson), "EX", ttl)
  return lesson
}

// Cache invalidation on write
async function updateLesson(id, patch) {
  await db.lessons.updateOne({ _id: id }, { $set: patch })
  await redis.del(`lesson:${id}`)     // invalidate; next read repopulates
  // Pattern: delete > overwrite. Overwriting a stale value risks a race
  // between the DB read and the cache write in concurrent requests.
}
```

```js
// Pub/sub: broadcast lesson completion events (fire-and-forget)
// Publisher (in progress-service)
await redis.publish("lesson:completed", JSON.stringify({ userId, lessonId, xp }))

// Subscriber (in notification-service)
const sub = redis.duplicate()
sub.subscribe("lesson:completed", (message) => {
  const event = JSON.parse(message)
  sendPushNotification(event.userId, `+${event.xp} XP earned!`)
})

// Distributed lock: prevent duplicate order processing
async function processOrder(orderId) {
  const lockKey = `lock:order:${orderId}`
  const lockToken = crypto.randomUUID()
  const acquired = await redis.set(lockKey, lockToken, "NX", "PX", 10_000) // 10s
  if (!acquired) return // another instance is processing

  try {
    await doWork(orderId)
  } finally {
    // Release only if we still own the lock (Lua for atomicity)
    await redis.eval(
      `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
      1, lockKey, lockToken
    )
  }
}
```

## In your project

Order Processing uses cache-aside for product catalog reads (high read:write ratio, tolerate stale for seconds) and a distributed lock to prevent double-processing of payment callbacks from the payment gateway. Pub/sub broadcasts order status changes to the notification service without coupling the services with a direct HTTP call.

## Tradeoffs & pitfalls

- **Cache invalidation timing**: invalidate (delete) the cache key immediately after a successful DB write. Do not update the cache with the new value — a concurrent reader may have already fetched the old value from DB and is about to overwrite your fresh value.
- **TTL as a safety net, not a strategy**: relying solely on TTL for consistency means stale data survives until expiry. For user-facing data that changes frequently, combine TTL with explicit invalidation on write.
- **Pub/sub message loss**: if no subscriber is connected when `PUBLISH` fires, the message is gone. Use Redis Streams with consumer groups if any message can be dropped.
- **Lock expiry vs work duration**: if your lock TTL (10s) is shorter than your work duration, two workers can hold the lock simultaneously. Always set TTL > p99 work time with a generous buffer, and use a watchdog thread to extend the lock if still working.

## Top-1% insight

The "thundering herd" / cache stampede problem is non-obvious under load: when a popular cached key expires, hundreds of concurrent requests all miss, all query the database simultaneously, and all try to repopulate the cache. Fix it with probabilistic early expiry (XFetch algorithm): recompute the cache slightly before expiry with probability proportional to time-to-expire and recompute cost. The formula is `expiry - current_time < beta * delta * log(rand())` — a single extra cache write prevents the herd. This is production-grade and worth knowing for any senior interview discussion about caching at scale.
