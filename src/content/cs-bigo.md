Big-O describes how the *number of operations* scales as input size n grows — not wall-clock time. It is the design lens that forces you to ask "what happens when n is a million?" before you ship.

## The core

Big-O notation keeps only the dominant term and drops constants, because hardware differences swamp constants but never change growth class. The hierarchy that matters in practice:

| Class | Example | Survives n = 10⁶? |
|---|---|---|
| O(1) | hash lookup | yes |
| O(log n) | binary search | yes |
| O(n) | linear scan | yes |
| O(n log n) | merge sort | yes (barely) |
| O(n²) | nested loops over same array | no |
| O(2ⁿ) | brute-force subsets | only n < 30 |

**Deriving complexity**: count the loops that grow with n, multiply nested loops, add sequential loops.

```ts
// O(n²) — for every node, scan all nodes to find its children
function buildChildrenNaive(nodes: Node[]): Map<string, Node[]> {
  const map = new Map<string, Node[]>()
  for (const node of nodes) {           // n
    const children: Node[] = []
    for (const candidate of nodes) {    // n  → O(n²)
      if (candidate.parentId === node.id) children.push(candidate)
    }
    map.set(node.id, children)
  }
  return map
}

// O(n) — one pass to group by parentId
function buildChildrenLinear(nodes: Node[]): Map<string, Node[]> {
  const map = new Map<string, Node[]>()
  for (const node of nodes) {           // n, once
    if (!map.has(node.id)) map.set(node.id, [])
    if (node.parentId) {
      if (!map.has(node.parentId)) map.set(node.parentId, [])
      map.get(node.parentId)!.push(node)
    }
  }
  return map
}
```

**Amortized analysis**: a dynamic array's `push` is O(1) amortized — occasional O(n) copies are paid off across all pushes. The total cost for n pushes is O(n), so the *average* cost per push stays O(1).

**Space complexity** follows the same rules: count the data you *allocate* relative to n, not what you read.

## In your project

In CUBE's hierarchical tree filter, the original code nested two loops over the same `nodes` array: for every node, it scanned all nodes to find children — O(n²). With 5 000 tree nodes, that's 25 million comparisons per filter interaction.

The fix: one pass to index nodes by `parentId` into a `Map`, then a second pass (or recursive walk) that looks up children in O(1) per node. Total: O(n). At 5 000 nodes the difference is 25 000 operations vs 25 000 000 — a 1 000× reduction before any profiling tricks.

## Tradeoffs & pitfalls

- **Constants matter at small n**: O(n log n) with a large constant can beat O(n) for n < 100. Profile before claiming a win.
- **Hidden inner loops**: `.find()`, `.filter()`, `.includes()` inside a loop each add a factor of n. The code *looks* flat but isn't.
- **Space/time tradeoff**: the O(n²)→O(n) fix trades memory (the `Map`) for time. If the node list is enormous and memory-constrained, you weigh that explicitly.
- **Worst case vs average case**: quicksort is O(n²) worst-case but O(n log n) average. Know which case you're quoting.

## Top-1% insight

**Amortized O(1) is not the same as guaranteed O(1)** — this distinction matters in real-time systems. A garbage collector that occasionally freezes is amortized O(1) but has O(n) latency spikes. Similarly, a hash map with periodic rehashing is amortized O(1) for inserts, but the rehash itself is O(n). If you need *guaranteed* bounded latency (game loop, audio thread, trading system), you must pre-allocate and avoid structures with amortized bounds. Interviewers love this nuance when you're analyzing "fast" data structures for latency-sensitive contexts.
