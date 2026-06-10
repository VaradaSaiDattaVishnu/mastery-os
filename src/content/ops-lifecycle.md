`POST /orders` returns a 202 to the client the moment the order is persisted and `order.created` is published — everything after that (stock reservation, payment, notification) happens asynchronously through the saga.

## The core

One HTTP request fans out into a multi-step distributed workflow. The critical design decision is where the **sync/async boundary** sits: at the moment order-service writes to its own MongoDB and publishes the event. The client gets a response before any downstream service has done a single unit of work.

```
Client
  │
  │ POST /orders  { userId, items, total }
  ▼
api-gateway :3000
  │  verifies JWT, checks RBAC, strips internal headers
  ▼
order-service :3002
  │
  ├─ 1. Validate request schema (packages/shared types)
  ├─ 2. Write Order { status: "PENDING" } → MongoDB
  ├─ 3. Publish order.created → RabbitMQ topic exchange
  │
  └─ 4. Return 202 { orderId } ← client gets this now
               │
               │ RabbitMQ fans out to:
        ┌──────┴────────────────────────────┐
        ▼                                   ▼
inventory-service :3003           anomaly-service :3006
  ├─ reserves stock (atomic)        └─ HTTP POST → ml-service :8000
  ├─ publishes inventory.reserved       scores the order, updates anomaly record
  │
  ▼
payment-service :3004
  ├─ processes payment
  ├─ publishes payment.completed or payment.failed
  │
  ▼
notification-service :3005
  └─ consumes terminal events, sends notification to user
```

The saga runs as choreography — no central orchestrator. Each service listens for the event that is its trigger, does its work, and publishes the next event. Compensation flows the same way: `inventory.reservation.failed` triggers a `payment.cancel` if payment has already run, and so on.

```ts
// order-service: the exact sync/async boundary
async function createOrder(req: Request, res: Response) {
  const order = await OrderModel.create({
    userId: req.user.id,
    items:  req.body.items,
    total:  req.body.total,
    status: 'PENDING',
  })

  // Publish — if this throws, we have a dual-write problem (see Tradeoffs)
  await publishEvent('orders', 'order.created', {
    orderId:  order._id.toString(),
    userId:   order.userId,
    items:    order.items,
    total:    order.total,
    timestamp: new Date().toISOString(),
  } satisfies OrderCreatedEvent)

  // Sync/async boundary: return NOW, saga continues asynchronously
  res.status(202).json({ orderId: order._id })
}
```

## In your project

The status field on the Order document is the saga's state machine. It moves: `PENDING` → `RESERVED` → `PAID` → `COMPLETED`, or `PENDING` → `FAILED` (with compensation). The dashboard polls or subscribes to see live status changes.

anomaly-service runs in parallel to the saga — it does not block payment. It consumes `order.created`, calls ml-service over HTTP, and writes the fraud score to its own MongoDB collection.

## Tradeoffs & pitfalls

**Dual-write problem**: step 2 (write to MongoDB) and step 3 (publish to RabbitMQ) are two separate writes. If the app crashes between them, the order exists in the database but the saga never starts. The production fix is the outbox pattern — write the event to a MongoDB collection in the same transaction as the order, then a background process reliably relays it to RabbitMQ. The current implementation accepts this risk at development scale.

**202 vs 201**: returning 202 Accepted (not 201 Created) is semantically correct here — the resource exists but its processing is not complete. Clients that treat a 202 like a 201 and assume the order is ready will build incorrect UIs.

**Observability gap**: once the response returns, there is no synchronous way to tell the client "inventory failed." The system must push a status update, or the client must poll `/orders/:id`. That polling endpoint is on order-service, not the gateway.

## Top-1% insight

The sync/async boundary is a product decision disguised as a technical one. Returning 202 immediately maximises perceived performance, but it means the user sees "order placed" while inventory might be about to fail. For most e-commerce systems that is fine. For a medical supply system, it is not. Senior engineers ask "what does the user believe is true when they see this response?" before they decide where to put the boundary.
