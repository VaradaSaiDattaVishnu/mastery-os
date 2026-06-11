**Trees are recursion's home turf. The universal shape: solve left, solve right, combine at the root.** Nodes here: `{ val, left, right }` (null = empty).

## Spot it
- "Depth/height", "is valid BST", "path sum", "same tree", "lowest common ancestor".
- If the answer at a node depends only on the answers of its children → one recursive function.

## The move
```js
function depth(node) {
  if (!node) return 0;                       // base: empty tree
  return 1 + Math.max(depth(node.left), depth(node.right));
}
```
```js
// The other crucial shape: pass CONSTRAINTS DOWN, not just answers up
function validBST(node, lo = -Infinity, hi = Infinity) {
  if (!node) return true;
  if (node.val <= lo || node.val >= hi) return false;
  return validBST(node.left, lo, node.val) &&
         validBST(node.right, node.val, hi);
}
```
The classic trap: checking only `child vs parent` misses grandchild violations — the *range* must travel down. If you can explain why, you understand BSTs.

In a **BST**, comparisons steer you: LCA of p,q is the first node where they split (one ≤ node ≤ other).

**Complexity:** O(n) time (visit each node once), O(h) space for the call stack — say "h is log n balanced, n worst case".

## Say this in the interview
"I'll recurse with the substructure: each node combines its children's answers. Base case null. Time O(n), space O(h) for recursion depth — I'll note the skewed-tree worst case."

## Now grind ⬇
Depth → same-tree → validate BST (the range trick) → BST lowest common ancestor. Trees come as nested object literals in the tests.
