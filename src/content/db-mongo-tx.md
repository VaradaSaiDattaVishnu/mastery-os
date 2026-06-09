MongoDB multi-document transactions give ACID semantics across collections — but the cost is real, so use them only when atomicity across documents is truly required.

## The core

MongoDB uses MVCC (Multi-Version Concurrency Control) for isolation. Each document write creates a new version; readers see a consistent snapshot from the transaction's start timestamp. WiredTiger maintains a "global transaction table" and per-document version history in a separate section of the data file. A transaction holds an intent lock on the database and document-level locks on touched documents — conflicting writes cause the later transaction to abort and retry.

**Write concern** controls how many replica set members must acknowledge a write before it is considered committed:
- `w: 1` (default): primary acknowledges — can be lost if primary crashes before replication
- `w: "majority"`: majority of voting members acknowledge — survives primary failure, ~1–2ms extra latency on a local replica set
- `w: 0`: fire-and-forget — never use for financial data

**Read concern** controls what data a read can see:
- `"local"`: read from primary, may see uncommitted data from other transactions (MongoDB's equivalent of READ UNCOMMITTED is not quite right — it reads committed data on that node but data that hasn't replicated)
- `"majority"`: read only data acknowledged by a majority
- `"snapshot"`: read a consistent snapshot from the transaction's start — required for true ACID reads within a transaction

```js
// Order Processing: reserve inventory + create order atomically
const session = await client.startSession()
try {
  await session.withTransaction(async () => {
    // Read concern "snapshot" + write concern "majority" for ACID
    const inventory = await db.collection("inventory").findOne(
      { productId: "p123", qty: { $gte: 2 } },
      { session }
    )
    if (!inventory) throw new Error("insufficient_stock") // auto-aborts

    await db.collection("inventory").updateOne(
      { productId: "p123" },
      { $inc: { qty: -2 } },
      { session }
    )

    await db.collection("orders").insertOne({
      _id: new ObjectId(),
      productId: "p123",
      qty: 2,
      status: "confirmed",
      createdAt: new Date()
    }, { session })
    // Both writes commit atomically or both roll back
  }, {
    readConcern:  { level: "snapshot" },
    writeConcern: { w: "majority" }
  })
} finally {
  await session.endSession()
}
```

```js
// Write concern on individual operations (outside transactions)
await db.collection("payments").insertOne(
  { orderId, amount, status: "settled" },
  { writeConcern: { w: "majority", j: true } }
  // j: true → also waits for journal flush to disk
)
// j: true adds ~1ms but guarantees durability even if OS crashes
// For idempotency, use a unique index on a client-generated idempotency key
await db.collection("payments").createIndex(
  { idempotencyKey: 1 },
  { unique: true }
)
```

## In your project

Order Processing uses transactions for the inventory-decrement + order-create flow. Without a transaction, a crash between the two writes leaves inventory decremented but no order record — a lost sale. The saga pattern handles failures across service boundaries (RabbitMQ), but within a single MongoDB service, a transaction is cleaner and faster than a compensating saga step.

## Tradeoffs & pitfalls

- **Transactions are expensive**: they hold locks and prevent conflicting writes. A transaction that runs for > 60 seconds is automatically aborted. Keep them short — read, compute in application memory, write, commit.
- **No transactions across shards pre-4.2**: distributed transactions (since 4.2) work across shards but add coordinator latency. If your writes always touch the same shard key, a single-shard transaction is as fast as a replica-set transaction.
- **`TransientTransactionError` and `UnknownTransactionCommitResult`**: these are the two retryable error labels. Always wrap transaction logic in a retry loop; the driver's `withTransaction` helper does this automatically.
- **Avoid transactions for single-document atomicity**: a single `findAndModify` (or `findOneAndUpdate`) is atomic without a transaction. Transactions are only needed when you must atomically touch multiple documents.

## Top-1% insight

MongoDB's transaction isolation level is "snapshot isolation," not "serializable." Snapshot isolation allows write skew anomalies: two concurrent transactions can each read the same data, make decisions based on it, and write non-conflicting fields — producing a state no serial execution could produce. For cases where you need true serializability (e.g., "only one winner in a contest"), use an optimistic concurrency pattern with a version field: read the document, increment a `version` counter in the update filter (`{_id: x, version: N}`), and retry if the update matches 0 documents — this is safer than assuming snapshot isolation is enough.
