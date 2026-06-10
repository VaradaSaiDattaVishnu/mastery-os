At 100x the current load, four specific seams break first — and fixing them requires architectural changes, not just more hardware.

## The core

A design review is not a critique — it is a prediction of where the system's assumptions stop holding. This system was designed correctly for its current scale. The question is: which assumptions will be violated first as load grows?

```
Current assumptions vs 100x load:

1. RabbitMQ single broker          → broker becomes the bottleneck
2. MongoDB single replica set      → write throughput on orders/payments saturates
3. Synchronous saga with retries   → retry storms amplify failures under load
4. ML scoring in the request path  → anomaly-service backs up, saga slows
5. In-process idempotency check    → Redis becomes a hot key under concurrent redeliveries
```

The four fixes, in priority order:

**1. RabbitMQ: add consumers before adding brokers.** The first scaling lever is horizontal consumer instances, not a clustered broker. Adding three instances of inventory-service behind the same queue (competing consumers) triples throughput with zero topology change. RabbitMQ clustering adds complexity; competing consumers are free.

**2. order-service: replace dual-write with the outbox pattern.** At scale, the window between the MongoDB write and the RabbitMQ publish is a reliability risk that grows with load. The outbox pattern eliminates it:

```ts
// Transactional outbox: write order AND outbox event in one MongoDB session
const session = await mongoose.startSession()
await session.withTransaction(async () => {
  const order = await OrderModel.create([{ ...orderData, status: 'PENDING' }], { session })
  await OutboxModel.create([{
    exchange:   'orders',
    routingKey: 'order.created',
    payload:    JSON.stringify(buildOrderCreatedEvent(order[0])),
    processed:  false,
  }], { session })
})
// A relay process polls OutboxModel and publishes unprocessed events to RabbitMQ
```

**3. anomaly-service: decouple ML scoring from the saga.** Currently anomaly-service consumes `order.created` and blocks until ml-service responds. At 100x load, if ml-service is slow (model retraining, GC pause), the anomaly queue backs up. The fix is to make anomaly scoring fire-and-forget from the saga's perspective — score asynchronously, store the result, and let the dashboard display it when ready. The saga should not wait for a fraud score before processing payment.

**4. The ML service: it is not actually anomaly detection at this level.** The current Isolation Forest on 7 features with 100 synthetic bootstrap orders is not a model — it is a dressed-up threshold. The "24σ above normal" explanation is a calibration artefact, not a trained signal. The most important architectural fix is replacing this with a proper labelled dataset (genuine fraud examples, not synthetic ones), a real evaluation set, and a calibrated model that can be measured on precision/recall. Without this, the anomaly flag adds noise, not signal.

```
What breaks at 100x and the fix:

Bottleneck              | Current               | 100x fix
------------------------|----------------------|-----------------------------
Message throughput      | 1 consumer/service   | Competing consumers (easy)
Order write durability  | Dual-write           | Outbox pattern (medium)
ML latency impact       | Sync in saga path    | Async + fire-and-forget (easy)
ML model quality        | Synthetic bootstrap  | Labelled data + eval (hard, correct)
Rate-limit Redis        | Single key per user  | Lua script + local cache (medium)
No distributed tracing  | Console logs only    | OpenTelemetry + trace IDs (medium)
```

## In your project

The observability gap is the most urgent operational risk at any scale. Right now, a saga that silently fails (order stuck at PENDING) is invisible unless someone queries MongoDB directly. Adding a `correlationId` (the orderId itself) to every log line and every RabbitMQ message header, then aggregating logs by correlationId, turns a debugging session from hours to minutes.

## Tradeoffs & pitfalls

**The distributed monolith warning**: this system has clean service boundaries today. The most common way they erode is through a "shared utilities" package that slowly accumulates business logic. `packages/shared` should contain only types, middleware, and messaging helpers — never domain logic. Domain logic that is shared is a sign the bounded contexts are wrong.

**Evolution over rewrite**: none of the 100x fixes require a rewrite. The outbox pattern is an additive change to order-service. Competing consumers require zero code changes. Async ML scoring is a routing key change. Good architecture makes the next change cheap.

## Top-1% insight

The single most important architectural property you cannot add later is **observability**. Features, scaling, and new services can all be added incrementally. But if you have been running a distributed system for a year without trace IDs, structured logs, and correlation between events, retrofitting observability requires touching every service and every event. The correct time to add a `correlationId` field to `packages/shared`'s event envelope is now, before the system has a year of events without one.
