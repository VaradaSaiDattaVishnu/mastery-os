**"Level by level / nearest / by depth" → BFS with a queue.** The one non-negotiable trick: snapshot the queue length before each level so levels don't bleed into each other.

## Spot it
- "Level order", "right side view", "minimum depth", "zigzag", "nearest X".
- BFS finds the *shallowest* answer first — if the question says "minimum steps/depth", DFS is the wrong tool.

## The move
```js
function levelOrder(root) {
  if (!root) return [];
  const res = [], q = [root];
  while (q.length) {
    const size = q.length;               // ← freeze THIS level's size
    const level = [];
    for (let i = 0; i < size; i++) {
      const node = q.shift();
      level.push(node.val);
      if (node.left) q.push(node.left);
      if (node.right) q.push(node.right);
    }
    res.push(level);                     // children queued = next level
  }
  return res;
}
```
Every BFS variant is this skeleton with one line changed: right-side view keeps `level.at(-1)`; min-depth returns the first level containing a leaf; zigzag reverses odd levels.

**Complexity:** O(n) time, O(w) space — w = max width (up to n/2 in the last level).

## Say this in the interview
"Nearest-first means BFS. I'll process level-by-level by freezing the queue size each round — that's what keeps depths separate. Space is the widest level, not the height."

## Now grind ⬇
Level order (the skeleton itself) → right side view (one-line twist) → minimum depth (early exit — and why DFS would mislead you).
