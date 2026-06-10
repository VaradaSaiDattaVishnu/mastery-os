A saga replaces the impossible distributed transaction with a chain of local steps, each paired with a compensation that undoes it if a later step fails.

## The core

Distributed transactions (two-phase commit) require all participants to lock resources and agree atomically — this is impractical across independently-deployed services with separate databases. A saga accepts that each step commits locally and uses **compensating transactions** to roll back already-committed steps if a later step fails.

The saga in this system is **choreography-based**: no central coordinator. Each service reacts to an event, does its local work, and publishes the result. The failure path mirrors the forward path.

```
order-service
  │ publishes: order.created
  ▼
inventory-service
  ├─ SUCCESS: atomically decrements stock (findOneAndUpdate + $inc)
  │           publishes: inventory.reserved { reserved: true }
  └─ FAILURE: publishes: inventory.reserved { reserved: false, reason: "OUT_OF_STOCK" }
                │
                ▼
             order-service compensates: order.status = FAILED (no payment taken yet)

inventory.reserved { reserved: true }
  │
  ▼
payment-service
  ├─ SUCCESS: charges customer
  │           publishes: payment.completed
  └─ FAILURE: publishes: payment.failed
                │
                ▼
             inventory-service compensates: reverses the stock reservation
             order-service compensates: order.status = FAILED

payment.completed
  │
  ▼
notification-service
  └─ sends confirmation notification (terminal step, no compensation needed)
```

The atomic stock reservation in inventory-service is the hardest step — it must not double-reserve under concurrent orders for the same product:

```ts
// inventory-service: atomic reservation using findOneAndUpdate
async function reserveStock(
  orderId: string,
  items: Array<{ productId: string; quantity: number }>,
): Promise<{ success: boolean; reason?: string }> {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    for (const item of items) {
      const result = await ProductModel.findOneAndUpdate(
        {
          _id:      item.productId,
          quantity: { $gte: item.quantity },  // atomic check-and-decrement
        },
        { $inc: { quantity: -item.quantity } },
        { session, new: true },
      )

      if (!result) {
        await session.abortTransaction()
        return { success: false, reason: `Insufficient stock for ${item.productId}` }
      }
    }

    await session.commitTransaction()
    return { success: true }
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

// After reservation, publish result regardless of success/failure
await publishEvent(channel, 'inventory.reserved', {
  orderId,
  reserved: result.success,
  reason:   result.reason,
} satisfies InventoryReservedEvent)
```

Compensation for inventory is a separate function that increments stock back:

```ts
async function releaseReservation(orderId: string): Promise<void> {
  // Look up the reservation record (stored at reserve time) and reverse it
  const reservation = await ReservationModel.findOne({ orderId })
  if (!reservation) return   // idempotent — safe to call twice

  for (const item of reservation.items) {
    await ProductModel.updateOne(
      { _id: item.productId },
      { $inc: { quantity: item.quantity } },
    )
  }
  await ReservationModel.deleteOne({ orderId })
}
```

## In your project

inventory-service (port 3003) owns the reservation logic and its own MongoDB collection. payment-service (port 3004) consumes `inventory.reserved` events with `reserved: true` and ignores those with `reserved: false`. notification-service (port 3005) consumes both `payment.completed` and `payment.failed` as terminal events — it always sends a notification, the content just differs.

order-service listens to `payment.completed` and `payment.failed` to update its own Order status document, keeping the dashboard accurate.

## Tradeoffs & pitfalls

**Choreography vs orchestration**: choreography (this system) is simpler to implement but harder to trace — the "who called what" is implicit in the event flow. An orchestrator (a dedicated saga service holding a state machine) makes the flow explicit and easier to observe, at the cost of a new service and potential single point of failure.

**Partial failure visibility**: if inventory-service crashes after reserving stock but before publishing the event, payment-service never fires and the reservation is stuck. A timeout-based compensator that scans for PENDING orders and emits compensations is the safety net.

**Compensation is not rollback**: a compensation does not restore time — it executes new business logic. If a notification has already been sent saying "your order is confirmed," the compensation cannot unsend it. Design the saga to send notifications only after all critical steps succeed.

## Top-1% insight

The trickiest correctness property in a choreography saga is ensuring that a compensation is **itself idempotent**. If the compensation fires twice (because the consumer retried the `payment.failed` event), `releaseReservation` must not double-increment the stock. Storing the reservation in its own collection and deleting it on first compensation is the exact pattern that makes this safe — the second call finds no reservation record and returns early.
