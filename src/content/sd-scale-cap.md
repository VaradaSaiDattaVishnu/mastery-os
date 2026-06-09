CAP theorem states that a distributed system can guarantee at most two of: Consistency (every read sees the latest write), Availability (every request receives a response), and Partition tolerance (the system continues operating when the network splits) — because network partitions are not optional, the real choice is always between C and A during a partition.

## The core

Partition tolerance is not a design choice; a distributed system that cannot tolerate a partition is simply two separate systems. During a partition (two nodes cannot communicate), you must choose:

- **CP** (sacrifice availability): refuse requests that cannot be answered with a consistent view. Correct answers or no answer. Suitable for financial ledgers, inventory counts, distributed locks.
- **AP** (sacrifice consistency): answer from stale data. Always available but may return an outdated value. Suitable for DNS, shopping carts, social feeds.

**PACELC** extends CAP for the non-partition steady state: even when there is no partition (E), you trade Latency (L) against Consistency (C). This is the daily engineering reality — every synchronous replication adds latency; every async replication adds staleness.

```
PACELC matrix:
System          Partition      Else
─────────────── ──────────── ──────────────
Cassandra (AP)  A over C     L over C  ← tunable per-query
DynamoDB        A over C     L over C
MongoDB (CP)    C over A     C over L  ← leader-based writes
PostgreSQL      C over A     C over L
ZooKeeper (CP)  C over A     C over L
```

**Quorum reads/writes** give a spectrum between CP and AP. With replication factor RF=3:
- W=3, R=1: strongly consistent writes, fast reads (but write latency = slowest replica)
- W=1, R=3: fast writes, strong reads
- W=2, R=2: balanced quorum (W+R > RF=3), tunable latency
- W=1, R=1: eventual consistency, lowest latency, highest staleness risk

**Eventual consistency** is not "anything goes." It means that in the absence of new writes, all replicas will converge. The window of divergence is usually milliseconds in a healthy cluster, but can be arbitrarily long under load.

## In your project

CAP drives architecture decisions across the Order-Processing saga. Inventory reservation requires CP semantics — two concurrent orders for the last item must not both succeed. Payment requires CP. Notification is AP — a duplicate "order confirmed" email is tolerable; a missing inventory deduct is not. The choice of MongoDB per service with write concern `majority` and read concern `linearizable` for the inventory service reflects a deliberate CP stance.

## Tradeoffs & pitfalls

- **Confusing CAP with PACELC**: CAP only applies during a partition, which is rare. PACELC governs every request — misunderstanding this leads to choosing "CP" systems and then being surprised by high write latency in normal operation.
- **Stale reads under eventual consistency**: if a client writes then immediately reads from a different replica, it can observe its own write disappear ("read your own writes" anomaly). Fix with session consistency or sticky reads.
- **Phantom reads in quorum systems**: a quorum read sees a majority, but if the majority set changes between two reads in the same transaction, the second read may see different data.
- **Treating NoSQL as AP by default**: Cassandra, MongoDB, and DynamoDB all support tunable consistency. Defaulting to their "AP" preset for financial data is a correctness bug.

## Top-1% insight

"Linearizability" and "serializability" are not synonyms. Linearizability (a single-object property) means operations appear instantaneous and respect real-time order — a read after a write always sees that write. Serializability (a multi-object transaction property) means concurrent transactions appear to execute in some serial order — but that order can be in the past. A system can be serializable but not linearizable: a transaction reads a value written an hour ago and returns a result consistent with that old state. Spanner is both; most systems with "strong consistency" marketing are only one. Ask this in every system design discussion that involves consistency guarantees.
