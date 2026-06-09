Every `find` call is a predicate evaluated against each document in scope — the shape of that predicate determines which index MongoDB can use, or whether it scans the whole collection.

## The core

When the query planner receives a query it enumerates candidate index plans, runs them briefly in a "trial" phase, and picks the winner by fewest "work units" (document/index reads). The plan is cached by query shape (operator types + field names, not literal values) until the collection stats change significantly.

A query shape like `{status: 1, createdAt: {$gt: ...}}` can use a compound index on `(status, createdAt)` only if the equality fields come first and the range field comes last — the ESR rule: **Equality → Sort → Range**.

```js
// Find published posts, sorted newest first, only title + author
// Query shape: equality on status, range on publishedAt, sort createdAt
db.posts.find(
  { status: "published", publishedAt: { $gte: ISODate("2024-01-01") } },
  { title: 1, authorId: 1, createdAt: 1, _id: 0 }   // projection
).sort({ createdAt: -1 }).limit(20)

// Supporting index (ESR order):
db.posts.createIndex({ status: 1, createdAt: -1, publishedAt: 1 })

// Verify the plan — look for IXSCAN not COLLSCAN
db.posts.explain("executionStats").find(
  { status: "published", publishedAt: { $gte: ISODate("2024-01-01") } }
).sort({ createdAt: -1 }).limit(20)
// Key metrics: totalDocsExamined should equal nReturned for a tight index
```

```js
// Operator taxonomy
db.items.find({
  price:    { $gt: 10, $lte: 100 },   // range
  tags:     { $in: ["sale", "new"] },  // multikey — one index entry per array element
  name:     { $regex: /^shirt/i },     // prefix regex can use index; $regex in middle cannot
  deleted:  { $exists: false },        // sparse index trick: only index docs where field exists
  location: { $near: { $geometry: { type:"Point", coordinates:[-73.97,40.77] }, $maxDistance:1000 } }
  // ^ geospatial — needs 2dsphere index
})

// Negation operators ($ne, $nin, $not) cannot use an index efficiently — they force a scan
// Rewrite: if you query "status != 'archived'" → model an "active" boolean and index that
```

## In your project

Mongo Mastery's query visualizer lets learners write a `find` predicate and watch the planner choose an index plan. The shape parser must strip literal values and keep only operator+field structure to correctly demonstrate plan caching — this is why changing `{status: "draft"}` to `{status: "published"}` reuses the same cached plan without re-running the trial.

## Tradeoffs & pitfalls

- **Regex without prefix anchor (`^`)**: `/shirt/` cannot use a B-tree index — it requires scanning every index key. Always anchor full-text prefix lookups or use `$text` with a text index.
- **`$where` and JavaScript expressions**: evaluated per document in JavaScript context, always a full scan, 10–100x slower.
- **Projection on indexed fields**: if your projection includes only indexed fields (including `_id: 0`), MongoDB returns a covered query — it never touches the document store. Missing `_id: 0` forces a document fetch even when all other fields are indexed.
- **Array queries (`$elemMatch` vs dot notation)**: `{"scores.value": {$gt:80}}` and `{scores: {$elemMatch:{value:{$gt:80}}}}` look identical but behave differently when multiple conditions must apply to the same array element. Use `$elemMatch` for multi-condition array element matching.

## Top-1% insight

The query planner cache is keyed on query shape and index set. If you run `explain()` and see `FETCH` after `IXSCAN`, MongoDB is reading the document after the index to apply the predicate or return projected fields — this is called a "residual predicate" fetch. You can eliminate it by adding the projected and filtered fields to a compound index, turning the fetch into a fully covered plan. For high-QPS read paths in Mongo Mastery (lesson lookups by id + status), a covered query cuts latency by 30–60% because it stays entirely in the index B-tree pages, which fit in the WiredTiger cache.
