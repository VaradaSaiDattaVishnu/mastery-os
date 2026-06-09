Exactly-once processing is theoretically impossible across independent systems; the practical answer is at-least-once delivery combined with idempotent consumers, so that duplicate messages cause no harm, and dead-letter queues to handle messages that can never be processed successfully.

## The core

**Delivery guarantees:**
- At-most-once: send and forget. Message may be lost. Acceptable for metrics, logs.
- At-least-once: message delivered until acked. Duplicates possible. Requires idempotent consumers.
- Exactly-once: possible only within a single transactional resource (e.g., Kafka transactions within one cluster). Across services, it is a distributed coordination problem that reduces to 2PC with all its drawbacks.

**Idempotency key pattern**: attach a unique identifier to every operation. On receive, check whether the key has already been processed; if yes, return the cached result without re-executing.

```js
// Idempotent payment consumer
async function processPayment(msg) {
  const { idempotencyKey, orderId, amount } = JSON.parse(msg.content);

  // Check if already processed
  const existing = await redis.get(`idem:${idempotencyKey}`);
  if (existing) {
    channel.ack(msg);
    return; // safe to ignore duplicate
  }

  // Process within a DB transaction
  await db.transaction(async (tx) => {
    await tx.payments.create({ orderId, amount });
    // Mark processed atomically with the write
    await redis.set(`idem:${idempotencyKey}`, '1', 'EX', 86400);
  });

  channel.ack(msg);
}
```

**Dead-letter queue (DLQ)**: a message that fails processing is nacked. After `x-max-retry` attempts (implemented via a retry queue with exponential backoff), it is routed to the DLQ — a separate queue for human or automated inspection.

```
Primary Queue → Consumer fails → Retry Queue (TTL 30s) → Primary Queue
                                      ↓ (after 3 retries)
                                   DLQ → Alert → Manual review / replay
```

**Retry with exponential backoff:** avoid hammering a downstream dependency that is temporarily unavailable.
```
retry 1: wait 1s
retry 2: wait 2s
retry 3: wait 4s + jitter
→ DLQ after 3 failures
```

## In your project

The Order-Processing DLQ setup handles cases where the payment gateway is down: the message retries with backoff (not immediately), is inspected in the DLQ if all retries exhaust, and can be replayed once the gateway recovers. Idempotency keys on payment messages ensure that a replayed DLQ message does not double-charge a customer — the key is the `orderId` + `attemptId`, stored in Redis with a 24-hour TTL.

## Tradeoffs & pitfalls

- **Idempotency key TTL vs retention window**: if you expire the key in 24 hours but your DLQ retention is 7 days, a replayed message after 25 hours will be processed again. TTL must exceed the maximum replay window.
- **Non-idempotent side effects**: sending an email or triggering a webhook is hard to make idempotent. Use provider-level idempotency keys (Stripe, SendGrid both support this) and de-duplicate on the receiving side.
- **DLQ as a silent failure sink**: a DLQ that fills up without alerting is a data-loss event in slow motion. Always monitor DLQ depth and set a threshold alert.
- **Poison message detection**: a message that is malformed (bad JSON, schema mismatch) will always fail. It should go directly to the DLQ after the first parse failure rather than consuming retry budget.

## Top-1% insight

The "outbox + exactly-once illusion" pattern comes close to exactly-once semantics without distributed transactions: write the event to an outbox table in the same DB transaction as the business state change; a relay publishes it to the broker with a unique message ID; the consumer stores processed message IDs and skips duplicates. The relay can be retried safely because publishing a duplicate message ID is harmless — the consumer ignores it. The net result is: the event is published if and only if the DB committed, and processed if and only if the consumer has not seen that message ID before. This is as close to exactly-once as real systems get.
