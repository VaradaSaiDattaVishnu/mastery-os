Nine focused services communicating over RabbitMQ, each owning its own database — a deliberate architectural choice to make each concern independently deployable, not just independently named.

## The core

The system is shaped around a single rule: **no service reaches into another service's database**. That constraint forces every cross-service interaction through either a synchronous HTTP call (the gateway to services, or anomaly-service to ml-service) or an asynchronous RabbitMQ event. The result is a topology you can draw as a C4 container diagram and actually point to real code for every arrow.

```
Browser / Client
       │  HTTP
       ▼
  api-gateway :3000          ← JWT validation, RBAC, rate-limiting, routing
       │
  ┌────┼────────────────────────────────┐
  │    │   Synchronous HTTP (REST)      │
  ▼    ▼                                ▼
user-service  order-service         anomaly-service
   :3001          :3002  ─────────────────┘  (HTTP to ml-service :8000)
  MongoDB       MongoDB
                   │
                   │ publishes order.created
                   ▼
           [RabbitMQ topic exchange: orders]
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
inventory-svc  payment-svc  notification-svc
   :3003         :3004           :3005
  MongoDB       MongoDB         MongoDB
  + Redis       + Redis (idem)
```

The nine services are: api-gateway, user-service, order-service, inventory-service, payment-service, notification-service, anomaly-service, ml-service (Python FastAPI). The Next.js 14 dashboard is the tenth process but is not a service — it talks only to the gateway.

Every service is an Express + TypeScript + MongoDB process. The exception is ml-service: Python, FastAPI, scikit-learn, port 8000. Shared TypeScript types live in `packages/shared` so all services compile against the same event envelope definitions.

The system is event-driven at the workflow layer (order saga) and request-response at the user layer (gateway). That hybrid is intentional: user-facing reads need low latency, while order fulfillment can tolerate asynchrony.

## In your project

| Service | Port | Role |
|---|---|---|
| api-gateway | 3000 | Auth, routing, rate-limiting |
| user-service | 3001 | Registration, profiles, JWT issuance |
| order-service | 3002 | Create order, publish `order.created` |
| inventory-service | 3003 | Atomic stock reservation |
| payment-service | 3004 | Charge, retry, DLQ |
| notification-service | 3005 | Terminal-event → push/email |
| anomaly-service | 3006 | Consume `order.created`, call ml-service |
| ml-service | 8000 | FastAPI + Isolation Forest scoring |
| Next.js dashboard | varies | UI, talks only to gateway |

Docker Compose brings all nine services plus MongoDB, RabbitMQ, and Redis up with a single `docker compose up`.

## Tradeoffs & pitfalls

**Distributed monolith risk**: splitting code into nine repos does not make them nine services if they share a database or call each other synchronously in a chain. Check every arrow — if service A calls B calls C in the request path, you have a distributed monolith wearing a microservices costume.

**Operational overhead**: nine processes means nine places to check logs, nine health checks, and nine potential sources of a cascading failure. A modular monolith would have been operationally cheaper at this scale. The payoff is the ability to scale inventory-service and payment-service independently during peak load.

**Service boundary correctness**: the boundary between user-service and order-service is clean (order-service stores userId as a foreign key, does not reach into user-service's MongoDB). If that boundary ever breaks, the whole architecture's independence guarantee collapses.

## Top-1% insight

The hardest part of a microservices system is not writing the services — it is maintaining the seam between them over time. New developers will see a userId sitting in order-service and think "I'll just add a `$lookup` to user-service's collection." That single decision destroys service autonomy silently. The right protection is not process but schema ownership enforced at the infrastructure level: each service gets its own MongoDB connection string pointing to its own database, and those connection strings are not shared in configuration.
