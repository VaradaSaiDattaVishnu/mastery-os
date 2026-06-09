Sharding splits a dataset across multiple nodes so that each node owns a non-overlapping partition, scaling write throughput beyond a single machine; replication copies a partition to multiple nodes, scaling read throughput and providing fault tolerance.

## The core

**Range sharding** partitions by a sorted key range (e.g., user_id 0–999 on shard 0, 1000–1999 on shard 1). Supports range scans efficiently but creates hotspots when writes concentrate at one end of the keyspace (e.g., monotonically increasing timestamps always hit the last shard).

**Hash sharding** applies a hash function to the partition key and maps the result to a shard bucket. Distributes writes evenly but makes range queries require scatter-gather across all shards.

**Consistent hashing** maps both keys and shards onto a ring. When a shard is added or removed only ~K/n keys need to move (K = total keys, n = number of shards) — far better than the full rehash required by modulo-based partitioning.

```
         hash ring
    0 ───────────── 360°
   /      A(90°)     \
 D(315°)         B(180°)
   \      C(270°)    /
    └───────────────┘

Key hashes to 200° → assigned to node C (next clockwise node)
Adding node E at 240° steals only keys in [200°, 240°] from C
```

**Replication factor (RF)**: with RF=3, each partition is stored on 3 nodes. Writes must reach `W` nodes and reads must consult `R` nodes. The quorum condition `W + R > RF` guarantees overlap with at least one node that has the latest write.

```
RF=3, W=2, R=2 → W+R=4 > 3 → quorum read
RF=3, W=1, R=1 → W+R=2 ≤ 3 → eventual consistency (fast but stale reads possible)
```

## In your project

In scale-quest, sharding levels expose the hotspot problem directly: a partition key of `region` works until 80% of your users are in one region. Consistent hashing levels show that naive modulo breaks on node addition — a lesson that comes from Cassandra and DynamoDB's real design. When scale-quest adds a new DB tier, the mechanic of "which shard owns this key?" is exactly consistent hashing in action.

## Tradeoffs & pitfalls

- **Hotspot keys**: a celebrity user or trending item concentrates all traffic on one shard. Mitigate with key salting (append a random suffix 0–N, scatter writes, gather reads) or pre-splitting.
- **Cross-shard queries**: any query not filtered by the partition key requires a scatter-gather fan-out to all shards; latency is p99 of the slowest shard. Avoid by modeling data to co-locate what is queried together.
- **Rebalancing downtime**: naive modulo sharding rehashes ~100% of keys on resize. Always use consistent hashing or virtual nodes in a new design.
- **Shard count vs operational cost**: too few shards limits growth; too many fragments small tables unnecessarily. A common starting point is 2–4× the expected peak node count.

## Top-1% insight

MongoDB's chunk-based sharding and Cassandra's virtual nodes both implement consistent hashing, but with a critical difference: Mongo's balancer migrates chunks reactively after they exceed a size threshold (64 MB by default), which can cause a balancing storm under write load. Cassandra pre-assigns virtual nodes at cluster creation, distributing data from day one. If you use Mongo sharding in production, pre-split chunks before loading data — the default "split on hit" strategy produces severely unbalanced shards on bulk imports.
