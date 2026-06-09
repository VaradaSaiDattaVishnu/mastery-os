Model for access patterns, not for normalization theory: embed what gets read together, reference what has independent lifecycle or unbounded growth.

## The core

MongoDB stores documents as BSON — a binary encoding of JSON that adds types (ObjectId, Date, Decimal128). A document lives on a disk page inside a WiredTiger B-tree. When you embed a subdocument, that data lands on the same page; a single disk read fetches everything. When you reference via ObjectId, you pay a second round-trip (or a `$lookup`, which is a server-side join across two collection scans).

The key questions for every field:

- **Cardinality**: one-to-few (embed) vs one-to-many (reference) vs one-to-squillions (reference + parent-reference or bucketing)
- **Access together?** If you always load `user + address`, embed the address. If you sometimes load addresses independently, reference.
- **Mutability**: deeply embedded arrays that grow without bound bloat documents past the 16 MB limit and cause frequent page splits, hurting write performance.

```js
// Unity pattern: embed "few" subdocs, reference "many"
const courseSchema = {
  _id: ObjectId,
  title: String,
  // EMBED — always read with course, cardinality ≤ 10
  modules: [
    { _id: ObjectId, title: String, order: Number }
  ],
  // REFERENCE — independent lifecycle, could be thousands
  instructorId: ObjectId,      // → users collection
  categoryIds: [ObjectId],     // → categories collection
  createdAt: Date
}

// Opposite mistake — embedding unbounded comments
// DON'T: posts.comments = [{...}, {...}, ... 50000 items]
// DO: separate comments collection, post_id index
```

```js
// Polymorphic pattern — Unity's 15 module types in one collection
const contentSchema = {
  _id: ObjectId,
  type: 'video' | 'quiz' | 'pdf',   // discriminator
  courseId: ObjectId,
  // shared fields
  title: String, order: Number,
  // type-specific (sparse — not all docs have all fields)
  videoUrl: String,         // only for type='video'
  questions: [Object],      // only for type='quiz'
}
// Index on type to query a subset; sparse indexes skip null fields
```

## In your project

Unity has 38 models across 15 module types. The polymorphic pattern above keeps one `content` collection with a `type` discriminator instead of 15 tables — queries like "all content for course X ordered by sequence" stay single-collection. Instructors and students are referenced (not embedded) because they exist independently and appear across thousands of courses.

## Tradeoffs & pitfalls

- **Unbounded array growth**: embedding comments or log entries inside a parent document eventually hits 16 MB or causes WiredTiger document rewrites on every push, killing write throughput. Use a child collection once cardinality exceeds ~100.
- **Two-phase reads**: over-referencing recreates relational JOIN latency without ACID. If your app does `findOne(user)` then `find({userId})` in a loop, that is N+1 in disguise.
- **Denormalization drift**: embedding copies of data (e.g., `authorName` inside every post) means you must update all copies when the source changes. Accept it only when reads vastly outnumber writes and eventual consistency is fine.
- **Schema polymorphism cost**: a missing discriminator index makes `db.content.find({type:'quiz'})` a full collection scan.

## Top-1% insight

MongoDB has no enforced schema at the storage layer, but WiredTiger's compression works best when documents in a collection share the same field layout. Wildly heterogeneous document shapes defeat prefix compression, increasing on-disk size by 2–4x vs a uniform schema. In production, use a schema validation rule (`$jsonSchema`) to enforce the discriminator values and required fields — this is not just documentation, it prevents silent corruption from application bugs and improves storage efficiency.
