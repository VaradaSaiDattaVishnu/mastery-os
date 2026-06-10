Shared TypeScript types in `packages/shared` are the binding contract between every service — they prevent the event schema from drifting silently into inconsistency as the system evolves.

## The core

In a distributed system, the greatest source of invisible bugs is **event schema drift**: order-service publishes a field called `orderId` while payment-service expects `order_id`. Without a shared contract enforced at compile time, this difference is discovered at 2 AM in production, not in CI.

`packages/shared` solves this by exporting three categories of code used by every TypeScript service:

1. **Event type definitions** — TypeScript interfaces for every event on the bus (`OrderCreatedEvent`, `InventoryReservedEvent`, `PaymentCompletedEvent`, `PaymentFailedEvent`, etc.)
2. **Middleware** — auth extraction, correlation-ID propagation, request logging
3. **Utility types** — common error shapes, pagination wrappers, API response envelopes

```ts
// packages/shared/src/events/order.ts
export interface OrderCreatedEvent {
  orderId:    string
  userId:     string
  items:      Array<{ productId: string; quantity: number; price: number }>
  total:      number
  timestamp:  string          // ISO-8601; consistent across all consumers
}

export interface InventoryReservedEvent {
  orderId:   string
  reserved:  boolean
  reason?:   string            // populated on failure
}

export interface PaymentCompletedEvent {
  orderId:       string
  transactionId: string
  amount:        number
}

export interface PaymentFailedEvent {
  orderId: string
  reason:  string
  attempt: number
}
```

Services import from the package path, not via relative paths. The `package.json` workspace (pnpm) makes `@order-system/shared` available to all services without publishing to npm:

```json
// order-service/package.json
{
  "dependencies": {
    "@order-system/shared": "workspace:*"
  }
}
```

At publish time, order-service can use `satisfies` to enforce the shape:

```ts
import type { OrderCreatedEvent } from '@order-system/shared/events'

const event = {
  orderId:   order._id.toString(),
  userId:    order.userId,
  items:     order.items,
  total:     order.total,
  timestamp: new Date().toISOString(),
} satisfies OrderCreatedEvent        // compile error if schema diverges
```

At consume time, inventory-service casts the incoming message body to the same type, giving full IntelliSense and type narrowing.

## In your project

`packages/shared` is consumed by: api-gateway, user-service, order-service, inventory-service, payment-service, notification-service, anomaly-service. ml-service (Python) does not consume it — it receives a plain JSON payload over HTTP and uses Pydantic for validation on that side instead.

The CI pipeline runs `tsc --noEmit` across all packages before tests. If any service diverges from the shared type, the build fails before a container is ever built.

## Tradeoffs & pitfalls

**Temporal coupling through types**: if you add a required field to `OrderCreatedEvent`, every consumer must be updated and deployed before the producer can ship. This is a form of coupling that looks like decoupling. The mitigation is to add fields as optional first, deploy all consumers, then make the field required.

**The shared package can become a grab-bag**: over time developers copy utility functions, database helpers, or even business logic into `packages/shared` because "everyone needs it." The discipline is to keep only cross-cutting concerns (event types, middleware, error shapes) in shared, and keep business logic in the service that owns it.

**Versioning is not free**: in a true multi-team system you would version the shared package and use an event schema registry (Confluent, AWS Glue) to enforce compatibility. At this scale, the monorepo and TypeScript compiler serve the same purpose cheaply.

## Top-1% insight

The `satisfies` keyword (TypeScript 4.9+) is strictly better than a type assertion (`as OrderCreatedEvent`) at the publish site. An assertion silences errors; `satisfies` preserves the inferred type while validating the shape. Using `satisfies` at every `publishEvent` call turns the shared package into a compile-time contract that costs zero at runtime — and catches the field-rename bug before it ever reaches the queue.
