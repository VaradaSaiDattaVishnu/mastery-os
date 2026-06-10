RabbitMQ delivers at-least-once — every consumer must assume it will receive the same message more than once and produce the same outcome each time.

## The core

Exactly-once delivery is not something any message broker reliably provides. When a consumer processes a message and then crashes before acking, the broker redelivers it. The consumer must be built so that processing it twice is identical to processing it once.

The two tools are: an **idempotency key** stored in Redis, and a **dead-letter queue** for messages that exhaust their retry budget.

```
payment-service receives payment.charge event
        │
        ├─ 1. Extract messageId (set by publisher: crypto.randomUUID())
        ├─ 2. Check Redis: SET NX EX 86400 "processed:{messageId}"
        │        HIT  → already processed → ack and return (skip side effect)
        │        MISS → proceed
        │
        ├─ 3. Charge the customer (Stripe / payment provider)
        ├─ 4. Write PaymentRecord to MongoDB
        ├─ 5. SET Redis key (mark as processed)
        ├─ 6. Publish payment.completed
        └─ 7. ack message
```

The Redis SET NX (set if not exists) is atomic. Step 2 and step 5 bracket the side effect — if the process crashes between them and the message is redelivered, step 2 misses on redelivery (the key was never written) and processing runs again. This is acceptable: the payment provider's own idempotency key (sent in the charge request) prevents the double charge.

```ts
// payment-service: idempotency check
const redis = new Redis(process.env.REDIS_URL)

async function processPaymentWithIdempotency(
  msg: ConsumeMessage,
  payload: PaymentChargeEvent,
): Promise<void> {
  const messageId = msg.properties.messageId
  const dedupKey  = `processed:payment:${messageId}`

  const isNew = await redis.set(dedupKey, '1', 'NX', 'EX', 86400)
  if (!isNew) {
    // Already processed — safe to ack and discard
    channel.ack(msg)
    return
  }

  try {
    await chargeCustomer(payload, { idempotencyKey: messageId })
    await PaymentRecord.create({ orderId: payload.orderId, messageId, status: 'COMPLETED' })
    await publishEvent(channel, 'payment.completed', { orderId: payload.orderId })
    channel.ack(msg)
  } catch (err) {
    await redis.del(dedupKey)   // allow retry by clearing the key
    const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number
    if (retryCount >= 3) {
      channel.nack(msg, false, false)  // dead-letter after 3 attempts
    } else {
      channel.nack(msg, false, true)   // requeue for retry
    }
  }
}
```

The dead-letter queue receives messages after `channel.nack(msg, false, false)`. A separate consumer on the DLQ alerts, logs to persistent storage, and optionally queues a manual review task. It does not automatically retry — DLQ messages are there because retries failed.

```ts
// DLQ consumer in payment-service
await ch.assertQueue('payment.dlq', { durable: true })
await ch.bindQueue('payment.dlq', 'orders.dlx', 'payment.*')

ch.consume('payment.dlq', async (msg) => {
  if (!msg) return
  const payload = JSON.parse(msg.content.toString())
  logger.error({ payload, headers: msg.properties.headers }, 'Payment permanently failed — manual review required')
  // Alert, store to audit log, create ops ticket
  ch.ack(msg)   // ack DLQ message so it doesn't loop
})
```

## In your project

Redis at the shared infra layer serves double duty: idempotency store for payment-service and session/rate-limit store for the gateway. The idempotency TTL of 24 hours matches the window within which RabbitMQ would realistically redeliver a message.

The `messageId` is set by the publisher in `packages/shared/publishEvent` as `crypto.randomUUID()` and stored in `msg.properties.messageId`, which is part of the AMQP message envelope — not the payload body. This means the idempotency key travels with the message automatically.

## Tradeoffs & pitfalls

**Redis key expiry vs message redelivery window**: if a message is held in an unacknowledged state for longer than the TTL (24h) and then redelivered after expiry, the idempotency check misses and the side effect runs again. Match TTL to your broker's maximum redelivery window.

**The window between steps 2 and 5**: if the process crashes after the Redis SET but before the MongoDB write, the message will never be reprocessed (the key exists). This is an accepted tradeoff: accepting a missed payment is worse than a double charge that the payment provider deduplicates, so the key should be written as late as possible (after the charge succeeds).

**DLQ is a symptom, not a solution**: a growing DLQ is a signal that something is systematically wrong — a provider is down, a schema changed, a database is unreachable. Alerting on DLQ depth (via RabbitMQ management API metrics) is mandatory.

## Top-1% insight

Most teams implement idempotency at the business logic layer (checking for an existing `PaymentRecord` by orderId). This is correct but insufficient: the check is a read followed by a write, which is a race condition under concurrent redeliveries. The Redis `SET NX` is a single atomic operation that eliminates the race. The business-logic check becomes a second line of defence, not the primary one.
