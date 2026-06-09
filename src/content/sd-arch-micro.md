Microservices are only valuable when bounded by data ownership and team autonomy — split by business capability and let each service own its database; split by technical layer and you inherit a distributed monolith with all the operational complexity and none of the benefits.

## The core

**The bounded context rule**: a microservice boundary should map to a domain concept that has clear ownership, a stable interface, and an independent deployment lifecycle. The anti-pattern is splitting a single domain object (e.g., "user") across services based on operation type (read service, write service) — these services are coupled by the same data model and must deploy together.

**Data ownership is the hardest constraint**: each service owns its schema and is the only writer. Other services access that data through the service's API, not by querying its DB directly.

```
WRONG (shared DB):
  OrderService ──→ shared_db.orders
  InventoryService ──→ shared_db.orders  ← schema coupling, deploy coupling

RIGHT (owned DBs):
  OrderService     owns orders_db (MongoDB)
  InventoryService owns inventory_db (MongoDB)
  Communication via RabbitMQ events or HTTP API
```

**Modular monolith as the stepping stone**: a well-modularised monolith with clear internal boundaries (no cross-module DB queries, explicit interfaces) can be extracted into services when a specific module needs independent scaling or deployment. This is the strangler-fig pattern — extract one module at a time, keeping the monolith running.

**When microservices pay off:**
| Signal | Action |
|---|---|
| A module is deployed 10× more than others | Extract it |
| Two teams own one module | Split it |
| One service's load spikes independently | Extract it with its own DB |
| Clear domain boundary + stable API | Safe to split |

**When they don't:**
- Early-stage product where boundaries are not yet clear — premature splitting creates rigid seams that block feature development.
- Small team (<5 engineers) where operational overhead (9 deployment pipelines, 9 observability stacks) exceeds the autonomy benefit.

## In your project

The Order-Processing system's 9 services map cleanly to business capabilities: order lifecycle, inventory, payment, notification, user, ml-scoring, gateway, and two supporting services. Each has its own MongoDB instance. The coupling is only through RabbitMQ events and the gateway's HTTP API — changing the payment service's internal schema requires zero changes to any other service.

## Tradeoffs & pitfalls

- **Distributed monolith**: services that call each other synchronously in a chain (A→B→C→D) have no independent deployability — if D changes its API, A must redeploy. Minimize synchronous chains; favour async events.
- **Cross-service transactions**: without a saga, any operation that must span two services' databases either uses 2PC (fragile, blocking) or is eventually consistent. Design for eventual consistency by default.
- **Service discovery overhead**: in a monolith, a function call is nanoseconds. A cross-service HTTP call is milliseconds + failure modes (timeout, 503, partial response). Every service boundary is a network call that can fail.
- **Operational multiplication**: 9 services means 9× the logging setup, 9× the health-check wiring, 9× the deploy pipeline. Under-investment in platform tooling makes microservices slower to operate than the monolith they replaced.

## Top-1% insight

Conway's Law states that a system's architecture mirrors the communication structure of the team that built it. This means the right question before splitting a monolith is not "is this module complex enough?" but "do we have a team with clear ownership of this module?" If two teams share one codebase, they will step on each other regardless of how the code is structured. If one team owns a monolith with good internal boundaries, extracting services prematurely adds operational cost without the autonomy benefit. Architecture is a sociotechnical problem.
