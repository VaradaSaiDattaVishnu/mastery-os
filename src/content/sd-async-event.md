Event-driven architecture structures a system around the emission and consumption of immutable facts (events) rather than direct calls between services; the key shift is from "tell service B to do X" (command) to "this thing happened" (event), letting downstream services decide what to do independently.

## The core

**Event vs command**: a command is addressed to a specific recipient and expects a response. An event is a broadcast fact — no expectation of who listens or how they respond. This distinction changes coupling fundamentally.

```
Command (coupled):   OrderService.call('InventoryService.reserve', {orderId, qty})
Event (decoupled):   publish('order.created', {orderId, userId, items, timestamp})
                         └── InventoryService subscribes and reserves
                         └── AnalyticsService subscribes and records
                         └── NotificationService subscribes and emails
```

**Choreography vs orchestration**:

| | Choreography | Orchestration |
|---|---|---|
| Control | Distributed — each service reacts to events | Centralised — a saga orchestrator issues commands |
| Coupling | Services know only the event schema | Orchestrator knows the full flow |
| Debugging | Hard — flow emerges from interactions | Easier — single place shows state |
| Resilience | No central SPOF | Orchestrator is a SPOF unless HA |

Pure choreography is elegant but becomes hard to reason about beyond 4–5 services. Most real systems are hybrid: use choreography for loose, fan-out notifications and orchestration for multi-step business processes (like payment sagas) where rollback logic must be coordinated.

**Event schema contracts**: an event is a public API. Breaking changes in the payload break all subscribers. Strategies: additive-only changes (add fields, never remove), versioned topics (`order.created.v2`), or a schema registry (Avro + Confluent Schema Registry for Kafka-based systems).

```yaml
# Example event envelope
{
  "eventId": "evt_01J2X3",
  "type": "order.created",
  "version": "1",
  "timestamp": "2025-03-15T10:00:00Z",
  "data": {
    "orderId": "ord_9f2a",
    "userId": "usr_3c1b",
    "items": [{"productId": "p1", "qty": 2}],
    "totalAmount": 4999
  }
}
```

## In your project

The Order-Processing system's nine services are wired by events on RabbitMQ topic exchanges. When `order-service` publishes `order.created`, the inventory service, payment service, and notification service all react independently. No service calls another directly — this is why adding an analytics subscriber required zero changes to existing services. The choreography works cleanly here because the flow is linear; the orchestration layer (saga) only engages when compensation is needed.

## Tradeoffs & pitfalls

- **Temporal coupling**: even in event-driven systems, consumers can create implicit ordering dependencies. If the notification service assumes inventory has already been reserved when it receives `order.created`, you have hidden temporal coupling.
- **Event loss**: fire-and-forget event emission without durability guarantees (i.e., publishing before the DB write commits) means you can lose events on crash. Use the outbox pattern.
- **Schema drift**: two teams evolve the same event schema independently and break each other six months later. Enforce schema contracts early.
- **Debugging distributed flows**: a single user action can fan out to 10 async handlers across 5 services. Without distributed tracing, debugging means correlating logs by a correlation ID manually.

## Top-1% insight

The outbox pattern solves the dual-write problem at the event emission boundary. Instead of writing to the DB and publishing to the queue in two separate operations, write the event to an `outbox` table in the same DB transaction as the business data. A separate relay process polls the outbox and publishes to the broker, then marks the row as sent. This guarantees that an event is published if and only if the DB transaction committed — eliminating the lost-event and phantom-event failure modes entirely.
