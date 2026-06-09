Observability is the ability to understand a system's internal state from its external outputs — logs, metrics, and traces are the three pillars, but the goal is to answer "what is wrong and where?" without deploying new code or SSH-ing into a server.

## The core

**The three pillars and what they answer:**

| Pillar | Question answered | Tool |
|---|---|---|
| Logs | What happened in this service? | Winston, Pino, structured JSON |
| Metrics | Is the system healthy right now? | Prometheus + Grafana |
| Traces | Where did this request spend its time? | OpenTelemetry + Jaeger/Tempo |

**Structured logging**: log as machine-parseable JSON, not human-readable strings. Every log line should include a correlation ID so events from a single request can be joined across services.

```json
{
  "level": "error",
  "correlationId": "corr_9f2a3c",
  "service": "payment-service",
  "orderId": "ord_4b1e",
  "error": "stripe_timeout",
  "durationMs": 5012,
  "timestamp": "2025-03-15T10:01:05.012Z"
}
```

**Metrics and SLOs**: an SLO (Service Level Objective) defines what "healthy" means as a measurable target. Without an SLO, every alert is a judgement call; with one, alerts are automatic.

```
SLO: 99.9% of /api/orders requests complete in < 500ms over a 30-day window
Error budget: 0.1% × 30 days × 24h × 3600s = 2592 seconds of allowed downtime

Track:
  - Request rate (RPS)
  - Error rate (4xx, 5xx)
  - Latency percentiles (p50, p95, p99)
  - Saturation (CPU, memory, queue depth)
```

**Distributed tracing**: a trace spans the entire lifetime of a request across services. Each service creates a span; spans are linked by a trace ID propagated in HTTP headers (`traceparent`).

```
TraceID: abc123
  Span: gateway           [0ms ──────────────── 45ms]
    Span: order-service   [2ms ──────── 38ms]
      Span: MongoDB        [5ms ─── 12ms]
      Span: RabbitMQ pub   [20ms ─ 25ms]
    Span: inventory-svc   [30ms ──── 37ms]  ← async, shows up in trace
```

**The four golden signals** (Google SRE): latency, traffic, errors, saturation. Instrument these four for every service and you have a complete operational picture.

## In your project

The Order-Processing system spans 9 services — without distributed tracing, a 3-second order creation is impossible to diagnose. A correlation ID injected at the gateway flows through RabbitMQ message headers and MongoDB query metadata, allowing a single trace view to show that 2.8 of those 3 seconds were spent in `payment-service` waiting on the Stripe API. SLOs on the gateway's `/api/orders` endpoint define the error budget for release decisions.

## Tradeoffs & pitfalls

- **Log verbosity vs cost**: debug-level logs in production generate terabytes of data and meaningful search costs. Use structured sampling (log 1% of healthy requests at DEBUG, 100% of errors) to balance visibility and cost.
- **Metric cardinality explosion**: adding a user_id label to a Prometheus metric creates one time series per user. At 1M users, this breaks Prometheus. High-cardinality data belongs in a trace (where it is bounded per request), not a metric.
- **Trace sampling**: recording 100% of traces at high load is expensive. Use head-based sampling (decide at trace start) or tail-based sampling (record all, but only keep traces for slow/error requests). Tail-based sampling is more useful but requires buffering.
- **Alert fatigue**: too many alerts that are not actionable train teams to ignore them. Every alert must have a runbook. Alert on SLO error budget burn rate, not raw error counts.

## Top-1% insight

The difference between logging and observability is whether you can debug a novel failure mode without deploying new instrumentation. Systems with good observability emit enough structured data that you can answer questions you did not think to ask when you wrote the code. The practical test: can a new engineer diagnose a production issue using only the observability tooling, without reading source code? If not, the instrumentation is insufficient regardless of how many dashboards exist.
