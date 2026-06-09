A container is a process running in an isolated Linux namespace with a union-mounted filesystem — not a VM, not a copy of an OS. Understanding how image layers are built and cached is the difference between a 3-second rebuild and a 3-minute one.

## The core

**The image layer model.** A Docker image is a stack of read-only layers. Each `RUN`, `COPY`, and `ADD` instruction in a Dockerfile creates a new layer. Layers are content-addressed: if a layer's instruction and all layers below it are identical to a previous build, Docker reuses the cached layer instead of re-executing it. The key insight: **order matters**. Instructions that change rarely (installing OS packages, installing npm dependencies) must come before instructions that change often (copying your source code).

**Copy-on-Write (COW).** When a running container writes a file, the container runtime copies that layer to the container's writable layer — the underlying image layer is never modified. This is why ten containers can run from the same image with minimal extra disk usage.

**Multi-stage builds.** You can use multiple `FROM` instructions in one Dockerfile. The final stage only contains what you `COPY --from=builder` into it. This is the standard pattern for compiled languages and TypeScript: build in a `node:20-alpine` builder stage (which has devDependencies, the TypeScript compiler, etc.), then copy only `dist/` and `node_modules` (production only) into a minimal final image.

**`docker-compose`** declares multi-container topologies as code. It handles networking, volume mounting, dependency ordering, and environment variable injection — making local development reproducible and CI setup trivial.

```dockerfile
# JARVIS: multi-stage Dockerfile
# ---- Stage 1: builder ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy manifest first — Docker caches this layer until package.json changes
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source — this layer invalidates on every source change
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm run build     # outputs to dist/

# ---- Stage 2: production image ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Install only production deps in the final image
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Copy compiled output from the builder stage — no TS compiler, no devDeps
COPY --from=builder /app/dist ./dist/

# Non-root user — security hardening
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```yaml
# Order Processing: docker-compose.yml for local dev
version: '3.9'

services:
  order-service:
    build:
      context: ./services/order
      target: runtime
    ports: ['3001:3001']
    environment:
      MONGO_URI: mongodb://mongo:27017/orders
      RABBITMQ_URL: amqp://rabbitmq:5672
    depends_on:
      mongo:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy

  mongo:
    image: mongo:7
    healthcheck:
      test: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"]
      interval: 5s
      timeout: 3s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports: ['15672:15672']   # management UI
    healthcheck:
      test: ['CMD', 'rabbitmq-diagnostics', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  inventory-service:
    build:
      context: ./services/inventory
    environment:
      RABBITMQ_URL: amqp://rabbitmq:5672
    depends_on:
      rabbitmq:
        condition: service_healthy
```

## In your project

JARVIS builds the TypeScript client, bundles the Express server, and serves it — all from one image. The multi-stage build keeps the final image small: no TypeScript compiler, no test dependencies. Order Processing uses docker-compose to wire nine services together; `depends_on` with health checks ensures RabbitMQ is accepting connections before any service tries to publish.

## Tradeoffs & pitfalls

**Fat images.** The most common mistake: `COPY . .` at the top of the Dockerfile, before dependency installation. This invalidates the dependency-install cache on every source change. Every developer who does this waits minutes for `npm install` on every rebuild.

**Running as root.** The default Docker user is root. A vulnerability in your Node.js app running as root inside a container can potentially escape the container. Always `USER nonroot` in production images.

**`.dockerignore` neglect.** Without `.dockerignore`, `COPY . .` copies `node_modules`, `.git`, local `.env` files, and test fixtures into the image layer. The image bloats, the cache is poisoned by local state, and secrets can leak. Treat `.dockerignore` with the same discipline as `.gitignore`.

**`CMD` vs `ENTRYPOINT` confusion.** `ENTRYPOINT` is the process; `CMD` is its default arguments. If you use only `CMD ["node", "dist/server.js"]`, you can override the entire command at `docker run`. If you use `ENTRYPOINT ["node"]` with `CMD ["dist/server.js"]`, you can override only the arguments. For a service container, `CMD` alone is usually right; for a CLI tool image, `ENTRYPOINT` is the right choice.

## Top-1% insight

The `--platform` flag and multi-platform builds (`docker buildx`) are essential production knowledge that most developers encounter only when their Apple Silicon (arm64) image fails to run on an amd64 production server. `docker buildx build --platform linux/amd64,linux/arm64 -t myimage:latest --push .` produces a manifest list so the correct architecture is pulled automatically. Build this into your CI pipeline from day one — retrofitting it after production incidents is painful. For base images, always pin to a digest (`node:20-alpine@sha256:...`) in production Dockerfiles: tags are mutable and `node:20-alpine` can silently change between your test build and your production deploy.
