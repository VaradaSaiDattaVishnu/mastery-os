The aggregation pipeline is a sequence of transformation stages executed in order on the server — think of it as a streaming Unix pipe where each stage receives a cursor and emits a cursor.

## The core

MongoDB evaluates each stage lazily: documents flow through one stage at a time without materializing the entire intermediate result set (unless a stage like `$group` must accumulate). The query planner can "push down" a leading `$match` and `$sort` before a `$lookup` to reduce the document set early — but only if the `$match` fields are indexed on the source collection.

Key stages and their internal behavior:

| Stage | Internal mechanism |
|---|---|
| `$match` | Becomes a `find` predicate; uses indexes if placed first |
| `$group` | Hash aggregation in memory; spills to disk if > 100 MB (set `allowDiskUse: true`) |
| `$sort` | Merge sort; uses index if at start of pipeline |
| `$lookup` | Nested-loop join; index on `foreignField` is critical |
| `$unwind` | Deconstructs an array into one document per element |
| `$project` / `$addFields` | Field shape transformation, no I/O |
| `$facet` | Runs multiple sub-pipelines on the same input in parallel |

```js
// Mongo Mastery: per-lesson completion stats with course metadata
db.progress.aggregate([
  // Stage 1: filter early — uses index on { userId: 1, completedAt: 1 }
  { $match: { userId: ObjectId("abc"), completedAt: { $gte: new Date("2024-01-01") } } },

  // Stage 2: group by lesson, count completions
  { $group: {
      _id: "$lessonId",
      completions: { $sum: 1 },
      avgScore:    { $avg: "$score" },
      lastSeen:    { $max: "$completedAt" }
  }},

  // Stage 3: join to lessons collection — needs index on lessons._id
  { $lookup: {
      from: "lessons",
      localField: "_id",
      foreignField: "_id",
      as: "lesson"
  }},
  { $unwind: "$lesson" },

  // Stage 4: shape output
  { $project: {
      _id: 0,
      lessonTitle: "$lesson.title",
      trackId:     "$lesson.trackId",
      completions: 1,
      avgScore:    { $round: ["$avgScore", 2] }
  }},

  { $sort: { avgScore: -1 } },
  { $limit: 10 }
])
```

```js
// $facet: run multiple aggregations in one pass — useful for paginated UI
db.lessons.aggregate([
  { $match: { trackId: "databases", status: "published" } },
  { $facet: {
      data:  [{ $sort: { order: 1 } }, { $skip: 0 }, { $limit: 20 }],
      total: [{ $count: "n" }]
  }}
])
// Returns { data: [...], total: [{n: 42}] } — avoids two round-trips
```

## In your project

Mongo Mastery's pipeline visualizer renders each stage as a node, showing the document count flowing into and out of each transformation. The architectural insight to teach: `$match` must come first (before `$lookup`, before `$unwind`) to avoid pulling millions of rows into the join. The visualizer makes this visceral — move `$match` after `$lookup` and watch the "docs in" counter explode.

## Tradeoffs & pitfalls

- **`$unwind` before `$group`**: if an array has 50 elements per document and you have 1 million documents, `$unwind` emits 50 million documents. Prefer `$group` operators that work directly on arrays (`$sum`, `$push`, `$addToSet`) without unwinding.
- **`$lookup` without a foreign index**: results in a collection scan per document in the left side. Always index `foreignField`.
- **Memory limit for `$group`**: default 100 MB. For large aggregations in production, set `{ allowDiskUse: true }` — but understand it will spill to the `_tmp` directory and be 5–10x slower.
- **Accumulators in `$group` vs `$project`**: `$sum`, `$avg` only work inside `$group` (or `$setWindowFields`). A common mistake is trying `{ $project: { total: { $sum: "$items.price" } } }` on an array — this works, but `$sum` in `$project` sums an array field in the same document, not across documents.

## Top-1% insight

`$lookup` with a `pipeline` subquery (the "expressive lookup" added in MongoDB 3.6) can join on non-equality conditions and filter the foreign collection before joining — dramatically reducing the data transferred. This is the MongoDB equivalent of a correlated subquery and is almost always faster than joining everything then filtering. Use it when you need `JOIN ... ON a.id = b.fk AND b.status = 'active'` rather than joining all of `b` first.
