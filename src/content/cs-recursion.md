Recursion is reducing a problem to a smaller version of itself until a base case resolves it. Trees are the canonical recursive structure — each node is itself the root of a smaller tree.

## The core

Every recursive function has three parts: the **base case** (stops the descent), the **recursive case** (reduces the problem), and **combination** (assembles sub-results). Miss the base case and you overflow the call stack. Miss correct reduction and you loop forever or produce wrong answers.

**Tree traversals** map directly onto these parts:

```ts
interface TreeNode {
  id: string
  parentId: string | null
  value: number
  children: TreeNode[]
}

// Pre-order: process node, then recurse into children
function preOrder(node: TreeNode, visit: (n: TreeNode) => void): void {
  visit(node)                          // process
  for (const child of node.children) {
    preOrder(child, visit)             // recurse
  }
}

// Post-order: useful when a parent depends on children's results
function sumTree(node: TreeNode): number {
  // base case: leaf node
  if (node.children.length === 0) return node.value
  // recursive: children first, then combine
  const childSum = node.children.reduce((acc, c) => acc + sumTree(c), 0)
  return node.value + childSum
}

// Memoized recursion — avoid recomputing subtrees
function countDescendants(
  id: string,
  childrenMap: Map<string, string[]>,
  memo: Map<string, number> = new Map()
): number {
  if (memo.has(id)) return memo.get(id)!
  const children = childrenMap.get(id) ?? []
  if (children.length === 0) { memo.set(id, 0); return 0 }
  const count = children.reduce(
    (acc, cid) => acc + 1 + countDescendants(cid, childrenMap, memo), 0
  )
  memo.set(id, count)
  return count
}
```

**Call stack depth = tree depth**. For a balanced binary tree of n nodes, depth is O(log n) — safe. For a degenerate tree (linked list), depth is O(n) — stack overflow risk for large n (typically 10 000+ frames in V8).

**Time complexity of tree recursion**: if each node is visited once and work per node is O(1), total is O(n). If work per node is O(depth), worst case is O(n²) on a skewed tree.

## In your project

CUBE's hierarchical grid is a tree of filter categories — departments contain sub-departments contain rows. When a parent filter node is toggled, the filter must propagate to all descendants. The naive approach walks the flat array for every node (O(n²), same antipattern as the lookup problem). The recursive solution with a pre-built `childrenMap` walks each node exactly once: O(n) traversal, O(1) child lookup per step.

Memoized recursion also applies when computing aggregate counts (e.g., "how many visible rows exist under this group?"). Cache the count per node; invalidate only when that subtree changes — not on every re-render.

## Tradeoffs & pitfalls

- **Stack overflow on deep/skewed trees**: iterative BFS/DFS with an explicit stack avoids this and is often faster due to fewer function-call overhead.
- **Off-by-one on base case**: returning too early (before processing the node) or too late (after a null dereference) is the most common bug.
- **Shared mutable state in recursion**: if the `memo` map is shared across calls with different semantics, you get stale cache hits. Scope the memo carefully.
- **Forgetting to return**: in TypeScript/JS, a missing `return` before the recursive call means the function returns `undefined`, silently corrupting results.

## Top-1% insight

The **call stack is implicit state** — and that is both recursion's elegance and its danger. Each stack frame holds the "continuation" of the computation. When you convert recursion to iteration (to avoid stack overflow), you make that implicit state *explicit* with a manual stack. The insight: any recursive algorithm can be rewritten iteratively by maintaining your own stack of `(node, phase)` pairs, where `phase` tracks whether you're descending or combining. This is exactly how JavaScript engines implement async/await under the hood — a state machine that captures what a recursive call-stack would hold.
