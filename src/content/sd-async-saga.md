A saga replaces a distributed transaction with a sequence of local transactions, each publishing an event or message that triggers the next step; when any step fails, the saga executes compensating transactions in reverse order to undo already-completed work.

## The core

Distributed transactions (2-phase commit, 2PC) lock resources across services until the coordinator decides commit or abort. This requires all participants to be available simultaneously, and the coordinator becomes a SPOF. The saga pattern trades atomicity for autonomy: each service commits locally and is responsible for publishing the outcome.

**2PC vs Saga:**
```
2PC:
  Coordinator → PREPARE  → Service A, B, C  (all lock)
  Coordinator ← VOTE-YES ← Service A, B, C
  Coordinator → COMMIT   → Service A, B, C  (all unlock)
  Problem: locks held across network round-trips; coordinator crash = deadlock

Saga:
  Step 1: InventoryService.reserve()     → publishes "inventory.reserved"
  Step 2: PaymentService.charge()        → publishes "payment.captured"
  Step 3: NotificationService.notify()   → publishes "notification.sent"
  Failure at Step 2:
    Compensation: InventoryService.release()  ← publishes "inventory.released"
```

**Choreography saga**: each service listens for a trigger event and emits the next. No central coordinator; resilient but hard to track.

**Orchestration saga**: a dedicated saga orchestrator drives the flow, issuing commands to services and handling responses. Easier to reason about, centralize retry logic, and build visibility dashboards.

```
Orchestrator state machine:
PENDING → INVENTORY_RESERVED → PAYMENT_CAPTURED → COMPLETED
             ↓ on failure            ↓ on failure
         COMPENSATING              COMPENSATING
             ↓                         ↓
         CANCELLED              INVENTORY_RELEASING → CANCELLED
```

Compensations must be **idempotent** — the orchestrator may retry them on crash recovery. A compensation that charges a refund twice is worse than the original failure.

## In your project

The Order-Processing system's `inventory → payment → notification` chain is a choreography saga. `inventory-service` reserves stock and publishes `inventory.reserved`; `payment-service` listens, charges, and publishes `payment.captured`; `notification-service` sends confirmation. If payment fails, a compensating message `payment.failed` causes `inventory-service` to release the reservation. Each service's local transaction is committed before the event fires — no global locks, no coordinator downtime.

## Tradeoffs & pitfalls

- **Compensations are not rollbacks**: a compensation executes new business logic (e.g., issue a refund, send a cancellation email) — it is not a database rollback. The intermediate state is visible to users during the saga. Design UX for this.
- **Saga isolation is weak**: between Step 1 completing and Step 3 completing, another saga can observe the intermediate state (reserved inventory, no payment yet). This "lost update" or "dirty read" at the saga level requires explicit business rules (e.g., inventory is "soft-reserved" not "committed").
- **Idempotency of compensations**: if the orchestrator crashes mid-compensation and replays the saga log, every compensation will be re-executed. They must be safe to run multiple times.
- **Long-running sagas**: a saga that spans hours (e.g., a hotel booking held pending payment) needs a timeout and expiry mechanism, not just happy/fail paths.

## Top-1% insight

Saga state should be persisted in a dedicated saga log / state store that is updated atomically with each step's outcome. The worst production failure mode is an "orphaned saga": the orchestrator crashed after Step 2 committed but before recording that it did — on recovery, it retries Step 2, double-charging the customer. The fix is the "process manager" pattern: the saga log row is updated inside the same DB transaction as the local business operation, then the message is emitted via the outbox. This makes every step recovery-safe by construction.
