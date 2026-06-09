A message queue is a durable buffer between a producer and one or more consumers; it decouples the two parties in time and space, letting each operate at its own pace without one crashing the other when load spikes.

## The core

RabbitMQ routes messages through **exchanges** before they reach queues. Understanding exchange types is the foundation of every messaging topology:

```
Producer → Exchange → (binding) → Queue → Consumer
```

- **Direct exchange**: routes to queues whose binding key exactly matches the message routing key. Used for point-to-point.
- **Topic exchange**: routing keys are dot-delimited words; bindings can use `*` (one word) or `#` (zero or more words). `order.#` matches `order.created`, `order.payment.failed`, etc. This is what the Order-Processing system uses.
- **Fanout exchange**: broadcasts to all bound queues, ignoring routing keys. Used for pub/sub.
- **Headers exchange**: routes on message headers instead of routing key.

**Acknowledgement semantics** determine at-least-once vs at-most-once delivery:
- `ack`: consumer sends an explicit ack after processing. If the consumer dies before acking, RabbitMQ requeues the message. This is at-least-once — design consumers to be idempotent.
- `nack` with `requeue=false`: sends the message to a dead-letter exchange (DLX) for inspection.
- Auto-ack: message is deleted as soon as delivered. At-most-once — fast but lossy.

**Prefetch count** controls how many unacknowledged messages a consumer receives at once. Without it, RabbitMQ sends all queued messages to the first consumer that connects, starving others.

```js
// RabbitMQ consumer with manual ack and prefetch
channel.prefetch(10); // process max 10 at a time
channel.consume('order.created', async (msg) => {
  try {
    await processOrder(JSON.parse(msg.content.toString()));
    channel.ack(msg);
  } catch (err) {
    // requeue=false sends to DLX after maxRetries
    channel.nack(msg, false, shouldRetry(err));
  }
});
```

## In your project

The Order-Processing system uses a topic exchange with routing keys like `order.created`, `order.payment.failed`, and `order.notification.sent`. Each downstream service (inventory, payment, notification) binds to the patterns it owns. This means adding a new consumer (e.g., an analytics service) requires zero changes to producers — bind a new queue to the existing exchange.

## Tradeoffs & pitfalls

- **Queue depth as a pressure gauge**: a growing queue length is your earliest warning sign of a consumer bottleneck. Alert on it before users notice.
- **Message ordering**: RabbitMQ guarantees ordering within a single queue and single consumer, but not across consumers. If order matters globally (e.g., sequential inventory updates for one product), use consistent-hash sharding on the routing key to pin all messages for one entity to one consumer.
- **Large messages**: a queue is not a file store. Messages over ~128 KB should store the payload in S3/blob storage and pass the reference. Large messages fill memory and slow replication.
- **Poison messages**: a message that always triggers an exception will be nack/requeue-looped indefinitely, blocking the queue. Always configure a max-retry count and a DLX.

## Top-1% insight

RabbitMQ's "at-least-once" guarantee applies to the broker's delivery, not to your processing. If your consumer acks before completing the side effect (e.g., you ack then write to DB and the DB write fails), the message is gone. If you write to DB then ack and the process crashes between the two, you reprocess a message your DB already received. The correct pattern is: complete all side effects idempotently, then ack. This is why idempotency keys and the DLQ are inseparable from queue design.
