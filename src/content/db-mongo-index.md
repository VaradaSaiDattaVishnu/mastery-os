A MongoDB index is a B-tree whose leaf pages hold the indexed key(s) and a pointer to the document's RecordId — a covered query never leaves that tree.

## The core

WiredTiger stores each index as a separate B-tree file on disk. Every leaf page holds a sorted run of `(key, RecordId)` pairs. An IXSCAN walks the B-tree from root to leaf in O(log n), collects matching RecordIds, then (for non-covered queries) fetches document pages from the main collection B-tree using those RecordIds — this second step is the FETCH stage you see in `explain()`.

**Compound index key ordering matters:**
- Keys are sorted lexicographically: first by field1, then within equal field1 values by field2. A query on field2 alone cannot use this index — it would require scanning all keys.
- ESR rule for compound indexes: Equality fields first, then Sort fields, then Range fields. This minimizes the number of index entries scanned.

**Multikey indexes** (on array fields): MongoDB creates one index entry per array element. If a doc has `tags: ["a","b","c"]`, there are 3 index entries. You cannot have two multikey fields in the same compound index.

```js
// Explain output dissected
db.lessons.explain("executionStats").find(
  { trackId: "databases", status: "published" },
  { title: 1, order: 1, _id: 0 }          // projection
).sort({ order: 1 })

/*
winningPlan: {
  stage: "PROJECTION_COVERED",            // never hit document store
  inputStage: {
    stage: "IXSCAN",
    indexName: "trackId_1_status_1_order_1_title_1",
    direction: "forward",
    indexBounds: {
      trackId: ["[\"databases\", \"databases\"]"],
      status:  ["[\"published\", \"published\"]"],
      order:   ["[MinKey, MaxKey]"],       // range — kept last per ESR
      title:   ["[MinKey, MaxKey]"]
    }
  }
}
executionStats: {
  nReturned: 42,
  totalKeysExamined: 42,    // perfect: 1:1 ratio
  totalDocsExamined: 0      // covered — no FETCH
}
*/

// Build the covering index:
db.lessons.createIndex(
  { trackId: 1, status: 1, order: 1, title: 1 },
  { name: "lessons_covered_browse" }
)
```

```js
// Partial index — only index published lessons (smaller tree, faster writes)
db.lessons.createIndex(
  { trackId: 1, order: 1 },
  { partialFilterExpression: { status: "published" }, name: "lessons_published" }
)
// Query MUST include the filter expression to use the partial index:
// db.lessons.find({ trackId: "databases", status: "published" }).sort({order:1}) ✓
// db.lessons.find({ trackId: "databases" }) — will NOT use partial index ✗

// Background/concurrent build — use for production without locking
db.lessons.createIndex({ createdAt: -1 }, { background: true })
// In MongoDB 4.4+ createIndex is always non-blocking on secondaries
```

## In your project

Mongo Mastery's index visualizer renders the B-tree as an interactive node tree, showing how inserting a document inserts a key into every index, and how a query walks root→branch→leaf. The key teaching moment: show `totalDocsExamined: 0` in `explain()` for a covered query — the document store is never touched.

## Tradeoffs & pitfalls

- **Over-indexing**: every index slows writes (every `insert`/`update`/`delete` must update all index B-trees). Unity's content collection should have no more than 4–5 targeted indexes, not one per field.
- **Index prefix rule**: a compound index `(a, b, c)` supports queries on `(a)`, `(a, b)`, and `(a, b, c)` — but not `(b)` or `(b, c)` alone. Dropping a single-field index on `a` after adding the compound index is safe and reduces write overhead.
- **Unbounded sort without index**: `find().sort({createdAt: -1})` with no index on `createdAt` triggers an in-memory sort. Over 32 MB of data, this returns an error without `allowDiskUse`.
- **TTL indexes**: a special single-field index on a Date field. MongoDB's background job runs every 60 seconds and deletes expired docs. Do not rely on sub-minute precision for expiry.

## Top-1% insight

The `hint()` method forces a specific index. In production, if the planner's cached plan goes stale after a data distribution shift (e.g., a new bulk insert changes the cardinality), the planner may pick a slow plan until the cache is evicted. You can force plan re-evaluation with `db.collection.getPlanCache().clear()` or by adding a hint in critical query paths. A senior engineer instruments slow-query logs (`db.setProfilingLevel(1, {slowms: 50})`) and watches `planSummary` to catch plan regressions after deployments or large data migrations.
