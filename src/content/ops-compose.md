Docker Compose brings up all nine services plus MongoDB, RabbitMQ, and Redis with a single command — but the health checks and `depends_on` conditions are what make the boot order reliable rather than just concurrent.

## The core

Without health checks, `depends_on` only waits for a container to *start*, not to be *ready*. MongoDB takes a few seconds to accept connections after its process starts. A service that connects to MongoDB on startup and starts before MongoDB is ready will crash — and Docker Compose will not restart it by default. Health checks close this gap.

```yaml
# docker-compose.yml (simplified to show the pattern)
services:
  mongo:
    image: mongo:7
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout:  5s
      retries:  5
      start_period: 10s   # grace period before first check

  rabbitmq:
    image: rabbitmq:3-management
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 10s
      timeout:  5s
      retries:  5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout:  3s
      retries:  5

  order-service:
    build: ./services/order-service
    ports:
      - "3002:3002"
    environment:
      MONGODB_URI:  mongodb://mongo:27017/orders
      RABBITMQ_URL: amqp://rabbitmq:5672
      JWT_SECRET:   ${JWT_SECRET}
    depends_on:
      mongo:
        condition: service_healthy      # wait for healthcheck to pass
      rabbitmq:
        condition: service_healthy
    restart: on-failure                 # restart if startup fails
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 10s
      timeout:  5s
      retries:  3
```

The full dependency graph in this system:

```
mongo ──────────────────────────────────────────────┐
rabbitmq ───────────────────────────────────────────┤
redis ──────────────────────────────────────────────┤
                                                     ▼
                            user-service, order-service, inventory-service,
                            payment-service, notification-service,
                            anomaly-service (also depends on ml-service)

ml-service ─────────────────────────────────────────┐
                                                     ▼
                                           anomaly-service

api-gateway depends on: (all application services)
```

Every application service exposes a `GET /health` endpoint that returns 200 only when it has a live database connection and a live RabbitMQ channel. The gateway's health check verifies its own Redis connection and that it can reach at least one upstream.

```ts
// Minimal health endpoint in each Express service
app.get('/health', async (_req, res) => {
  const dbOk = mongoose.connection.readyState === 1
  const mqOk = channel !== null && !channel.connection.connection.stream.destroyed
  if (dbOk && mqOk) {
    res.json({ status: 'ok' })
  } else {
    res.status(503).json({ status: 'degraded', db: dbOk, mq: mqOk })
  }
})
```

## In your project

The `docker compose up --build` command builds all service images from their Dockerfiles and boots the full system. The `--build` flag ensures fresh images when source changes. For the development loop, `compose watch` (Compose v2.22+) can hot-reload services on file change without full rebuilds.

ml-service is a Python FastAPI service: its Dockerfile installs `requirements.txt`, and its health check hits `GET /health` on port 8000. anomaly-service declares `depends_on: ml-service: condition: service_healthy` so it does not start until the ML model is loaded.

## Tradeoffs & pitfalls

**Health check false positives**: a health check that only checks `db.ping()` returns healthy even if the service's business logic is broken (wrong schema, failed migrations). A deeper health check that validates a known read query catches more — at the cost of more complexity and load.

**start_period matters for slow-starting services**: ml-service loads a scikit-learn model on startup, which can take 5–10 seconds. Without `start_period`, the health check fires immediately and marks the container unhealthy before it has had a chance to finish initialising.

**Compose is a dev tool**: Docker Compose is the right tool for a local dev loop and CI. In production, this system would move to Kubernetes or a managed container platform. The Compose file is still useful as documentation of the service topology and environment variables needed.

## Top-1% insight

The best use of Docker Compose in a multi-service system is not just running services — it is making the environment reproducible so that "works on my machine" is eliminated from the team's vocabulary. The Compose file should be the canonical source of truth for: what services exist, what environment variables each needs, what ports they expose, and what health condition makes them "ready." If that information lives only in someone's head or a Confluence page, the Compose file is not doing its job.
