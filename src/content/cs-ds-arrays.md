Hashing trades a bounded amount of extra memory for O(1) average-case lookup, insertion, and deletion — making it the single most impactful data structure in everyday engineering.

## The core

**Arrays** store elements at contiguous memory addresses. Index access is O(1) because the address of element i is `base + i * elementSize` — arithmetic, not traversal. Insertion/deletion in the middle is O(n) because subsequent elements must shift.

**Hash maps** wrap an array with a hash function. The key is hashed to a bucket index; the value is stored there. The critical properties:

- **Load factor** (n/capacity): as it rises above ~0.7, collisions increase and O(1) degrades.
- **Collision resolution**: separate chaining (linked list per bucket) keeps worst-case insertions O(1) but wastes memory; open addressing (linear/quadratic probing) stays in the array, improving cache locality.
- **Rehashing**: when load factor exceeds the threshold, the table doubles and all entries re-hash — O(n) for that operation, O(1) amortized.

```ts
// Manual hash map demonstrating the mechanics (not for production)
class SimpleHashMap<V> {
  private buckets: Array<Array<[string, V]>>
  private size = 0
  private readonly LOAD_THRESHOLD = 0.7

  constructor(private capacity = 16) {
    this.buckets = Array.from({ length: capacity }, () => [])
  }

  private hash(key: string): number {
    let h = 0
    for (let i = 0; i < key.length; i++) {
      h = (h * 31 + key.charCodeAt(i)) >>> 0  // keep 32-bit unsigned
    }
    return h % this.capacity
  }

  set(key: string, value: V): void {
    if (this.size / this.capacity > this.LOAD_THRESHOLD) this.rehash()
    const bucket = this.buckets[this.hash(key)]
    const existing = bucket.find(([k]) => k === key)
    if (existing) { existing[1] = value; return }
    bucket.push([key, value])
    this.size++
  }

  get(key: string): V | undefined {
    return this.buckets[this.hash(key)].find(([k]) => k === key)?.[1]
  }

  private rehash(): void {
    const old = this.buckets
    this.capacity *= 2
    this.buckets = Array.from({ length: this.capacity }, () => [])
    this.size = 0
    for (const bucket of old)
      for (const [k, v] of bucket) this.set(k, v)
  }
}

// In real code: O(1) lookup that powers the O(n) tree filter
const childrenByParentId = new Map<string, Node[]>()
for (const node of nodes) {
  if (node.parentId) {
    const list = childrenByParentId.get(node.parentId) ?? []
    list.push(node)
    childrenByParentId.set(node.parentId, list)
  }
}
// now: childrenByParentId.get(id) is O(1) instead of O(n)
```

**Sets** are hash maps where the value is a boolean — O(1) membership test. Use them to de-duplicate or for fast "have I seen this?" checks inside a loop.

## In your project

The CUBE tree filter's O(n²)→O(n) optimization is entirely enabled by `Map`. Before: scan all nodes to find children (O(n) per node × n nodes = O(n²)). After: build a `Map<parentId, Node[]>` in one O(n) pass, then look up children in O(1) per node during the tree traversal. The `Map` is the mechanism; Big-O analysis is why it matters.

## Tradeoffs & pitfalls

- **Hash collisions with adversarial keys**: predictable hash functions are vulnerable to hash-flooding DoS. JavaScript engines randomize string hashing per session to mitigate this.
- **Object key pitfall**: using objects as Map keys compares by *reference*, not value. Two `{ id: 1 }` objects are different keys. Use a string/number primitive as the key.
- **Ordered iteration vs hash maps**: `Map` preserves insertion order; a plain hash table does not. If you need sorted keys, use a sorted array + binary search (O(log n)) or a BST (O(log n)).
- **Memory overhead**: a hash map for 100 integers uses far more memory than a 100-element array. For dense integer keys, arrays beat maps.

## Top-1% insight

**Cache locality** is why arrays dominate hash maps for sequential access even when both are O(n). Arrays store elements contiguously; the CPU prefetcher loads cache lines ahead of your loop. A hash map with separate chaining scatters linked list nodes across the heap — each lookup may be a cache miss. For read-heavy workloads over known keys (e.g., filtering a flat list), a sorted array + binary search (O(log n) but cache-friendly) often beats a hash map (O(1) but cache-hostile) in real wall-clock time. This is why V8's hidden classes keep object property access array-like under the hood.
