RabbitMQ topic exchanges route events to queues by pattern-matching routing keys, giving you the fan-out flexibility of pub/sub while retaining the durability and ack semantics of a queue.

## The core

The system uses a **topic exchange** named `orders`. A topic exchange routes messages based on dot-separated routing keys matched against binding patterns, where `*` matches one word and `#` matches zero or more.

```
Publisher                    Exchange: orders (topic)
order-service  ──────────────────────────────────────────────────┐
  routing key: order.created                                      │
                                                                  ▼
                                               ┌─────────────────────────────────┐
                                               │  Bindings                       │
                                               │  order.*   → inventory.queue    │
                                               │  order.*   → anomaly.queue      │
                                               │  order.*   → payment.queue (✗)  │
                                               │  payment.* → notification.queue │
                                               │  payment.* → order.queue        │
                                               └─────────────────────────────────┘
                                                  ↓              ↓
                                           inventory.queue   anomaly.queue
                                                  │
                                         inventory-service consumes
                                           publishes: inventory.reserved
                                                  │
                                                  ▼
                                           payment.queue
                                         payment-service consumes
                                           publishes: payment.completed / payment.failed
                                                  │
                                         ┌────────┴────────┐
                                         ▼                  ▼
                                  notification.queue   order.queue
                                 (for terminal events) (status updates)
```

Two knobs control consumer behaviour:

**ack/nack**: a consumer calls `channel.ack(msg)` after successfully processing. If processing fails, `channel.nack(msg, false, requeue)` either requeues the message or (with requeue=false) dead-letters it. Never ack before the side effect is complete — acknowledging first and then crashing silently loses the message.

**prefetch**: `channel.prefetch(1)` tells RabbitMQ to send at most 1 unacknowledged message to this consumer at a time. Without prefetch, RabbitMQ will dispatch all queued messages to the first available consumer, overwhelming slow processors.

```ts
// shared RabbitMQ helper used by every service
import amqplib, { Connection, Channel } from 'amqplib'

export async function createChannel(url: string): Promise<Channel> {
  const conn: Connection = await amqplib.connect(url)
  const ch: Channel = await conn.createChannel()
  await ch.assertExchange('orders', 'topic', { durable: true })
  ch.prefetch(1)   // process one message at a time per consumer instance
  return ch
}

// order-service: publishing
export async function publishEvent(
  ch: Channel,
  routingKey: string,
  payload: unknown,
): Promise<void> {
  const buf = Buffer.from(JSON.stringify(payload))
  ch.publish('orders', routingKey, buf, {
    persistent:    true,          // survives broker restart
    contentType:  'application/json',
    messageId:    crypto.randomUUID(),  // idempotency key
  })
}

// inventory-service: consuming
export async function consumeQueue(
  ch: Channel,
  queue: string,
  bindingKey: string,
  handler: (msg: unknown) => Promise<void>,
): Promise<void> {
  await ch.assertQueue(queue, {
    durable:   true,
    arguments: { 'x-dead-letter-exchange': 'orders.dlx' },
  })
  await ch.bindQueue(queue, 'orders', bindingKey)
  ch.consume(queue, async (msg) => {
    if (!msg) return
    try {
      const payload = JSON.parse(msg.content.toString())
      await handler(payload)
      ch.ack(msg)                 // ack AFTER successful side effect
    } catch (err) {
      ch.nack(msg, false, false)  // dead-letter on permanent failure
    }
  })
}
```

## In your project

Every service that publishes or consumes calls these helpers from `packages/shared/src/messaging`. The exchanges and queue names are declared idempotently on startup — `assertExchange` and `assertQueue` are no-ops if the topology already exists, which means service startup order does not matter as long as RabbitMQ is healthy first (Docker Compose `depends_on` + healthcheck handles this).

The dead-letter exchange `orders.dlx` receives messages that have been nacked without requeue. payment-service has explicit dead-letter queue handling with retry count tracking.

## Tradeoffs & pitfalls

**Ack-before-side-effect**: acking a message before the database write completes means the message is lost if the process crashes mid-write. Always ack last.

**Lost events on connection failure**: if the connection to RabbitMQ drops after the order is written to MongoDB but before the publish completes, the saga never starts. The outbox pattern is the correct fix; a simpler workaround is to have a reconciliation job that finds PENDING orders older than N minutes and re-publishes.

**Prefetch and consumer starvation**: a prefetch of 1 is safe but limits throughput to one message per consumer process at a time. For inventory-service under load, you would increase prefetch and add worker instances rather than increasing prefetch to a large number on a single instance.

## Top-1% insight

`persistent: true` on a message is not enough — the queue must also be `durable: true`. A durable queue survives broker restart, but a non-persistent message published to it will still be lost. The combination of durable queue + persistent message + manual ack is the minimum required for at-least-once delivery. Most teams only set one of the three and wonder why messages disappear after a restart.
