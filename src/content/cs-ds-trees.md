Trees enforce a structural constraint (parent/child relationships, ordering, shape) that makes certain operations asymptotically faster than a flat array or hash map. The constraint you choose determines which operations you get for free.

## The core

**Binary Search Tree (BST)**: every left descendant is smaller, every right is larger. Search, insert, delete: O(h) where h is height. On a balanced tree h = O(log n); on a degenerate (sorted-insertion) tree h = O(n).

**Self-balancing BSTs** (AVL, Red-Black): automatically keep h = O(log n) via rotations after insert/delete. The price: more complex insertion. In practice you use the language's built-in (`TreeMap` in Java, `std::map` in C++ — both Red-Black). JavaScript has no built-in; you reach for a sorted array + binary search for most cases.

**Heap (min/max)**: a complete binary tree stored in an array where every parent is ≤ (min-heap) or ≥ (max-heap) its children. Key operations:
- `peek` (min/max): O(1) — it's always at index 0
- `push`: O(log n) — insert at end, bubble up
- `pop`: O(log n) — swap root with last, bubble down

The array storage is cache-friendly: children of node at index i are at `2i+1` and `2i+2`.

**Trie (prefix tree)**: each edge is a character; each node represents a prefix. Insert/search in O(L) where L is the string length — independent of n (number of strings stored).

```ts
// Min-heap in TypeScript
class MinHeap {
  private data: number[] = []

  push(val: number): void {
    this.data.push(val)
    let i = this.data.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.data[parent] <= this.data[i]) break
      ;[this.data[parent], this.data[i]] = [this.data[i], this.data[parent]]
      i = parent
    }
  }

  pop(): number | undefined {
    if (this.data.length === 0) return undefined
    const top = this.data[0]
    const last = this.data.pop()!
    if (this.data.length > 0) {
      this.data[0] = last
      let i = 0
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2
        let smallest = i
        if (l < this.data.length && this.data[l] < this.data[smallest]) smallest = l
        if (r < this.data.length && this.data[r] < this.data[smallest]) smallest = r
        if (smallest === i) break
        ;[this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]]
        i = smallest
      }
    }
    return top
  }

  peek(): number | undefined { return this.data[0] }
  size(): number { return this.data.length }
}

// Trie for prefix search (autocomplete)
class TrieNode { children = new Map<string, TrieNode>(); isEnd = false }
class Trie {
  root = new TrieNode()
  insert(word: string): void {
    let node = this.root
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode())
      node = node.children.get(ch)!
    }
    node.isEnd = true
  }
  startsWith(prefix: string): boolean {
    let node = this.root
    for (const ch of prefix) {
      if (!node.children.has(ch)) return false
      node = node.children.get(ch)!
    }
    return true
  }
}
```

## In your project

CUBE's hierarchical filter tree is a general tree (n-ary, not binary). Its structure is identical to what you'd represent with a BST — parent/child relationships — except the ordering constraint differs (it's hierarchy, not magnitude). Understanding BST invariants makes you fluent in reasoning about any tree: depth, traversal order, and the impact of balance on worst-case lookup all transfer directly.

A heap would power any "show top-N rows by value" feature: push all n row values in O(n), pop the top-k in O(k log n) — far faster than sorting everything O(n log n) when k << n.

## Tradeoffs & pitfalls

- **Unbalanced BST**: inserting pre-sorted data produces a linked list. Always use a balanced variant or sort input first.
- **Heap is not fully sorted**: `heap[1]` is not necessarily the second smallest element. The heap only guarantees the root is min/max.
- **Trie memory**: a trie for large alphabets (Unicode) with `Map` children has significant per-node overhead. A compressed trie (radix tree) is more space-efficient.
- **Off-by-one in heap indexing**: parent = `(i-1) >> 1`, left child = `2i+1`. Getting this wrong produces silent corruption — test with small inputs first.

## Top-1% insight

**Heapify (build-heap) is O(n), not O(n log n)** — a classic non-obvious result. Calling `push` n times costs O(n log n). But starting from a random array and sifting down from the last internal node to the root is O(n): nodes near the leaves (the majority) only travel a short distance, and the work sums to a geometric series bounded by 2n. This is why `heapq.heapify` in Python is O(n). In an interview, if you need the k-th smallest from an array, build the heap in O(n) then pop k times in O(k log n) — total O(n + k log n), which beats sorting when k is small.
