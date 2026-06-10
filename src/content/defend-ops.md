A production-grade event-driven microservices platform that processes orders through an asynchronous choreography saga over RabbitMQ, with every order scored in real-time by a genuine Isolation Forest ML pipeline that replaced a prior rules-as-ML fraud detector.

## Architecture

Nine services communicate exclusively through RabbitMQ topic exchanges; no service calls another service directly except anomaly-service calling ml-service over HTTP.

```
Browser
  └── Next.js frontend (port 3007)
        └── api-gateway (port 3000) — JWT auth, Redis-backed rate limit (100 req/min), RBAC
              ├── user-service    (3001) — MongoDB, registration/login
              ├── order-service   (3002) — MongoDB, publishes order.created → orders.exchange
              ├── inventory-svc   (3003) — MongoDB, consumes order.created, atomic $gte+$inc
              ├── payment-svc     (3004) — MongoDB, consumes inventory.reserved, DLQ+retries
              └── notification-svc (3005) — pure consumer, no DB, in-memory log

RabbitMQ topic exchanges:
  orders.exchange      routing key: order.created
  inventory.exchange   routing keys: inventory.reserved, inventory.failed
  payments.exchange    routing keys: payment.completed, payment.failed
  notifications.exchange routing keys: anomaly.detected, payment.*

  anomaly-service (3006) — also binds ANOMALY_DETECTION queue to orders.exchange / order.created
        └── HTTP POST /score → ml-service (8000) — FastAPI, Isolation Forest, joblib

Shared infra: MongoDB (port 27017), RabbitMQ (5672/15672), Redis (6379)
```

Order saga flow: POST /orders → order-service saves to Mongo and publishes `order.created` to `orders.exchange` with a generated `correlationId`. inventory-service and anomaly-service each bind their own durable queues to `orders.exchange / order.created` — they fan out in parallel. Inventory atomically decrements stock and publishes `inventory.reserved` or `inventory.failed` to `inventory.exchange`. payment-service consumes `inventory.reserved`, attempts payment (simulated 90% success), publishes `payment.completed` or `payment.failed` to `payments.exchange`. notification-service and order-service both consume terminal events; order-service updates order status to `COMPLETED`, `PAYMENT_FAILED`, or `FLAGGED`. If the anomaly-service gets `is_anomaly: true` back from ml-service, it publishes `anomaly.detected` to `notifications.exchange`, which both notification-service and order-service consume to set status `FLAGGED` and attach the score, reasons, and `modelVersion`.

## Three decisions you must justify

**Decision 1: Topic exchanges instead of direct exchanges**

Decision: All four RabbitMQ exchanges are declared as `type: 'topic'` in `publishEvent()` inside `packages/shared/src/events/rabbitmq.ts`. Routing keys like `inventory.*`, `payment.*` use AMQP wildcards.

Why: A topic exchange lets any consumer bind with a pattern. The order-service consumes `inventory.*` (one binding catches both `inventory.reserved` and `inventory.failed`) and `payment.*` without needing a separate queue per event type. anomaly-service added itself to `order.created` events without touching order-service at all — the Open/Closed Principle enforced by the broker.

Rejected alternative: Direct exchanges require an exact routing key match. Adding the anomaly-service would have forced a new binding per event type and potentially a change in every producer.

Trade-off: Topic exchanges are harder to reason about when bindings multiply. A message sent to `order.#` matches queues bound to `order.created.queue` and any future `order.updated.*` — accidental over-consumption is possible if naming discipline breaks down.

**Decision 2: Isolation Forest over a supervised model**

Decision: `services/ml-service/app/model.py` trains `sklearn.ensemble.IsolationForest` with `n_estimators=200`, `contamination="auto"` (default), `random_state=42`, and an `anomaly_threshold=0.6` on the calibrated score.

Why: Order fraud is an unlabelled problem — there is no column in the orders collection marking historical fraud. Isolation Forest is unsupervised: it builds 200 random trees and measures how few splits it takes to isolate a point. Anomalies (rare, different) isolate in fewer splits than normal orders. No labels, no class imbalance, no need for a curated fraud dataset.

Rejected alternative: A supervised classifier (XGBoost, logistic regression) would require labelled fraud examples. The prior system used TensorFlow.js "trained" on synthetic random numbers — it was hard-coded thresholds (`amount > 10000`) dressed as ML. A supervised model trained on that synthetic data would encode the same arbitrary thresholds.

Trade-off: Isolation Forest cannot learn "fraud looks like X" because it has never been told what fraud looks like. Its contamination parameter controls sensitivity globally. A labelled dataset — even 200 confirmed fraud cases — would yield a more precise classifier. The cold-start bootstrap also means early scores are learned from synthetic orders, not real behaviour.

**Decision 3: Choreography saga over a 2PC distributed transaction**

Decision: No central orchestrator exists. Each service reacts to events: inventory-service consumes `order.created`, payment-service consumes `inventory.reserved`, and so on. Compensation (rollback of stock) is triggered when `inventory.failed` is published — `rollbackReservations()` in `inventoryConsumer.ts` increments stock back with `$inc`.

Why: Two-Phase Commit requires all participants to hold locks and a coordinator to survive crash-recovery. In a containerised environment where any service can restart independently, a blocked coordinator is a system-wide freeze. Choreography is fully decentralised — each service knows only its own step and its own compensating action.

Rejected alternative: An orchestrator saga (e.g. a dedicated workflow service publishing commands) would give a single view of the in-flight saga state and make compensations explicit. The choreography approach scatters saga state across multiple services and event logs.

Trade-off: Debugging requires correlating events across four services using `correlationId`. There is no single place to ask "what state is this saga in?" — you infer it from the order's `status` field and the RabbitMQ management UI.

## The hardest bug

**Symptom**: An order shows `PAYMENT_FAILED` in the dashboard after three retries, but the payment processor was actually charged on the second attempt. The customer was not double-charged only because the third attempt failed, but if the processor had succeeded on both attempts two charges would have been recorded.

**Root cause**: RabbitMQ delivers at-least-once. The payment consumer processes the `inventory.reserved` message and calls the (simulated) payment processor, but crashes or throws before calling `ch.ack(msg)`. RabbitMQ sees a `nack` and re-delivers the original message bytes. The retry via the DLQ sends the same message again. `Payment.findOneAndUpdate` with `{ upsert: true }` will update the existing payment record, but the processor has already been charged. The code does not send a deduplication key or idempotency key to the payment processor before the first call, so a second processor call is a second charge.

**Fix**: Generate a stable idempotency key — e.g. `sha256(orderId + attemptNumber)` — and pass it to the payment processor API before any charge. On the consumer side, check `Payment.findOne({ orderId })` first: if `status === COMPLETED`, ack immediately and skip the processor call. This makes the consumer idempotent: receiving the same message twice is safe. The `x-death` header tracking retry count (already in `getRetryCount()`) provides the `attemptNumber` without modifying the original message payload.

## What you'd change at scale

**Outbox pattern for order-service**: The current code does `Order.create()` then `publishEvent()` in the same HTTP handler. If the service crashes between the two calls, the order is saved but the event is never published — the saga never starts. At scale, replace this with a MongoDB transactional outbox: write the event document in the same transaction as the order, and have a separate relay process publish it. This gives exactly-once event emission without distributed transactions.

**Dedicated payment idempotency store**: At high volume, `findOneAndUpdate` with `upsert` is not sufficient — the upsert itself can race. A Redis `SET orderId NX EX 3600` guard before calling the processor is a single atomic check that survives concurrent retries.

**Model versioning and A/B scoring**: The current `model_version` string (`if-812-2026-06-01T03:12:19`) is stored on the order but there is no canary deployment path. At scale, store model artifacts in S3/GCS with immutable version IDs and shadow-score new model versions in parallel before promoting.

**Partition RabbitMQ by tenant**: All orders share a single `orders.exchange`. At scale, high-volume tenants starve low-volume ones. Sharding by `tenantId` prefix in the routing key (`tenant.abc.order.created`) allows per-tenant queue depth monitoring and throttling.

**Observability**: The `correlationId` flows through every event envelope, but there is no distributed tracing exporter (OpenTelemetry spans). At scale, add trace context propagation so a single Jaeger or Tempo trace shows the full saga timeline: order created → inventory reserved → payment completed, with durations per step.

## Probing Q&A

**Q: Why RabbitMQ topic exchanges instead of direct exchanges?**

A: Topic exchanges support wildcard routing keys. The order-service's event consumer binds `inventory.*` to a single queue and catches both `inventory.reserved` and `inventory.failed` with one binding. The anomaly-service added itself as a second consumer of `order.created` without any change to order-service — it just declared its own durable queue (`anomaly.detection.queue`) bound to `orders.exchange / order.created`. With direct exchanges that fan-out would require the producer to know all destinations, collapsing publish-subscribe into point-to-point.

**Q: Why Isolation Forest over a supervised model?**

A: The orders collection contains no fraud labels. Isolation Forest is the standard unsupervised detector for tabular data: it builds random trees and measures isolation depth. Points that are easy to isolate (anomalies) get shorter average path lengths. The prior implementation was TensorFlow.js trained on synthetic random data — functionally a rule engine (`amount > 10000`). We could not replace it with a supervised model without labelled historical fraud, and we do not have that. IF gives real statistical anomaly detection with zero labels. The contamination is set to `"auto"` so sklearn estimates the anomaly rate from the data rather than requiring us to guess it.

**Q: How do you guarantee an order isn't paid twice?**

A: This is the current gap, not a solved guarantee. RabbitMQ is at-least-once, so `inventory.reserved` can be delivered more than once if the consumer crashes before acking. The payment consumer uses `Payment.findOneAndUpdate({ orderId }, ..., { upsert: true })` which updates the existing record on a retry, but does not prevent a second call to the payment processor before the record exists. The correct fix is: check `Payment.findOne({ orderId, status: 'completed' })` first and ack immediately if found, and send a stable idempotency key to the payment processor. The infrastructure for reading retry count from `x-death` headers is already there — it just needs to be coupled to a pre-processor idempotency check.

**Q: Why a saga instead of a distributed 2PC transaction?**

A: 2PC requires all participants to hold locks and a coordinator to be available and crash-consistent. In Docker Compose or Kubernetes, any service restarts independently. A coordinator crash during the prepare phase leaves all participants blocked waiting for a commit or abort that never comes. Choreography saga is fully decentralised: each service owns one step and one compensating action. If inventory fails, it publishes `inventory.failed` and calls `rollbackReservations()` to increment stock back. No participant waits for another. The trade-off is that debugging requires tracing `correlationId` across four services' logs.

**Q: How is the anomaly score explainable, and what does "24σ above normal" mean?**

A: The explanation uses leave-one-feature-out ablation in `model.py`'s `explain()` method. For each of the 12 features, the feature value is replaced with its training median, the order is re-scored, and the change in `decision_function` is recorded. A large positive delta means removing that feature made the order look significantly more normal — that feature drove the flag. The top 4 contributors are returned. The σ figure comes from `_describe()`: `sigma = (value - training_mean) / training_std`. "24σ above normal" means the order's `amount_vs_global_z` feature is 24 standard deviations from the mean of training orders — statistically extreme. The calibrated score is a logistic transform of the raw `decision_function` divided by its training spread (`df_scale`), so 0.5 is exactly the model's own decision boundary, not an arbitrary threshold.

**Q: What happens when payment-service is down?**

A: Messages accumulate in `payment.process.queue` (durable, survives RabbitMQ restart). RabbitMQ's `prefetch(1)` means each consumer takes one message at a time, so messages are not lost — they wait. When payment-service restarts it begins consuming from where it left off. If a message is nacked (processing error, not down-service), it routes to `payment.dlx` → `payment.dlq` with a 30-second TTL, then requeues automatically. After three nacks (tracked via `x-death` headers in `getRetryCount()`), the message goes to `payment.parking.queue` for manual review. Orders in the saga that are waiting on payment remain in `INVENTORY_RESERVED` status until the service recovers.

**Q: How do you avoid train/serve skew?**

A: The same function — `extract_features()` in `features.py` — is called in both `build_training_matrix()` (training path) and `main.py`'s `/score` handler (serving path). The feature vector order is a fixed 12-element list in `FEATURE_NAMES`. Global statistics (`global_mean`, `global_std`) are stored on the `AnomalyModel` object at training time and passed to `extract_features()` at serve time. Per-user contextual features are computed from the same MongoDB query shape: `load_user_prior_orders(userId, before=now, exclude_order_id=orderId)` returns `{"amount": float, "ts": datetime}` dicts, identical in structure to what `build_training_matrix()` constructs from historical orders. The model is persisted with `joblib` so the training-time medians, means, stds, and `df_scale` are loaded back identically on restart.

**Q: How does the DLQ retry mechanism work mechanically?**

A: `payment.process.queue` is declared with `deadLetterExchange: 'payment.dlx'` and `deadLetterRoutingKey: 'payment.failed'`. When the consumer throws (triggering `ch.nack(msg, false, false)` in the shared `consumeEvents` wrapper), RabbitMQ moves the message to `payment.dlx`. That exchange routes it to `payment.dlq`, which has `messageTtl: 30000` and its own `deadLetterExchange` pointing back to `inventory.exchange` with routing key `inventory.reserved`. After 30 seconds the message pops back into the main queue. `getRetryCount()` reads the `x-death` header array that RabbitMQ appends on each dead-letter transit — summing the `count` fields gives the total retry number.

**Q: How does order-service know the saga has finished?**

A: It subscribes to events on three separate exchanges using wildcards: `inventory.*` on `inventory.exchange` (catches both `inventory.reserved` and `inventory.failed`), `payment.*` on `payments.exchange` (catches `payment.completed` and `payment.failed`), and `anomaly.detected` on `notifications.exchange`. Each handler calls `Order.findByIdAndUpdate` to set the appropriate `OrderStatus` enum value. The order document in MongoDB is the single source of truth for saga state — querying it gives the current step, and the `anomalyScore`, `anomalyReasons`, and `anomalyModelVersion` fields are populated only when the ML pipeline flags the order.

**Q: What is the cold-start behaviour of the ML model?**

A: On startup, `bootstrap()` in `training.py` checks for a persisted `models/model.joblib`. If found, it loads it. If not, it calls `train_model()`, which checks whether real order count exceeds `MIN_TRAINING_SAMPLES` (default 50). Below that threshold, `generate_synthetic_orders()` produces a realistic synthetic dataset that is then augmented with any real orders that do exist. The model is trained on this combined set and `cold_start=True` is set on the model object. This flag flows through to every `/score` response so callers know to weight scores less confidently. The scheduler retrains every 1800 seconds; once real orders exceed 50, the next retrain sets `cold_start=False`.
