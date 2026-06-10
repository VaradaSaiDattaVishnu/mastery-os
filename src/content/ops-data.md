Each service owns its own MongoDB database and is the sole writer to it — no other service touches it directly. Redis serves as the shared-nothing caching and idempotency layer.

## The core

Database-per-service is the constraint that makes microservices actually independent. If two services share a schema, you cannot deploy one without coordinating the other. The rule is simple: **a service's database is an implementation detail, invisible to the outside**.

```
api-gateway      → no database (stateless)
user-service     → mongodb://mongo:27017/users
order-service    → mongodb://mongo:27017/orders
inventory-service→ mongodb://mongo:27017/inventory   + Redis (stock cache)
payment-service  → mongodb://mongo:27017/payments    + Redis (idempotency keys)
notification-svc → mongodb://mongo:27017/notifications
anomaly-service  → mongodb://mongo:27017/anomalies
```

All services connect to the same MongoDB *server* (one container in dev), but each uses its own *database name*. In production, each service would get its own MongoDB cluster or Atlas project. The dev configuration is a practical convenience, not a shared-DB architecture — the access control is at the application layer.

The same MongoDB instance runs different collections per database, but because each service's Mongoose models are registered in their own process with their own connection string, there is no way for order-service's code to accidentally query the payments database. The constraint is enforced by configuration, not by a wall.

```ts
// order-service: connection is scoped to the orders database only
import mongoose from 'mongoose'

await mongoose.connect(process.env.MONGODB_URI!)
// MONGODB_URI = mongodb://mongo:27017/orders — hardcoded in the service's .env

const OrderSchema = new mongoose.Schema({
  userId:    String,         // foreign key — NOT populated via $lookup to user-service
  items:     [{ productId: String, quantity: Number, price: Number }],
  total:     Number,
  status:    { type: String, enum: ['PENDING','RESERVED','PAID','COMPLETED','FAILED'] },
  createdAt: { type: Date, default: Date.now },
})

export const OrderModel = mongoose.model('Order', OrderSchema)
```

Redis is used by two services in distinct patterns:

```ts
// inventory-service: stock level cache (cache-aside)
async function getStock(productId: string): Promise<number> {
  const cached = await redis.get(`stock:${productId}`)
  if (cached !== null) return parseInt(cached, 10)

  const product = await ProductModel.findById(productId).lean()
  await redis.setex(`stock:${productId}`, 60, product.quantity.toString())
  return product.quantity
}

// Invalidate on write — always invalidate before (not after) the DB write
async function updateStock(productId: string, newQty: number): Promise<void> {
  await redis.del(`stock:${productId}`)             // invalidate first
  await ProductModel.updateOne({ _id: productId }, { quantity: newQty })
}

// payment-service: idempotency store
await redis.set(`processed:payment:${messageId}`, '1', 'NX', 'EX', 86400)
```

## In your project

The gateway uses Redis for rate-limiting counters (TTL-based sliding windows). The `x-user-id` injected by the gateway is a string reference — no cross-service MongoDB join ever happens. When the order dashboard needs a user's display name alongside their orders, the frontend makes two parallel API calls: one to order-service for orders, one to user-service for the user profile.

## Tradeoffs & pitfalls

**Data consistency across services**: order-service stores `userId` as a string. If that user is deleted from user-service, order-service has no foreign key constraint to catch it. This is the price of independence: you need application-level soft-delete conventions or event-driven cleanup (`user.deleted` event → order-service marks orders as anonymised).

**Cache invalidation race**: if you invalidate the Redis key after the database write (instead of before), a concurrent reader can re-populate the cache with stale data between the write and the invalidation. Invalidate before writing to prevent this.

**No cross-service aggregation at the database layer**: a query like "all orders with the name of the customer who placed them" cannot be a MongoDB aggregation. It must be assembled in the application layer (fetch orders, collect userIds, batch-fetch users). This is intentional — it surfaces the coupling that would otherwise be hidden in a SQL JOIN.

## Top-1% insight

The most dangerous form of shared-database coupling is invisible: two services using the same connection string but different collection names. It looks clean until one service runs a migration, changes an index, or runs a backup that causes IOPS contention that slows the other. True database-per-service means separate connection strings pointing to separate databases, even if they run on the same server in development. The environment variable `MONGODB_URI` in each service's `.env` file is the architectural boundary, not just configuration.
