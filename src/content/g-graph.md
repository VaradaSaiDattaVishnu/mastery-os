**Grids and dependency lists are graphs in disguise. Three weapons: flood-fill DFS, multi-source BFS, and topological sort.** Plus the rule that prevents every infinite loop: mark visited *when you enqueue, not when you process*.

## Spot it
- Grid + "islands / regions / spread" → flood fill (DFS) or BFS waves.
- "Prerequisites / build order / can finish" → topo sort (cycle detection).
- "Minimum time for X to spread everywhere" → **multi-source** BFS: seed ALL sources at distance 0.

## The move
```js
// Flood fill: consume an island
function sink(grid, r, c) {
  if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return;
  if (grid[r][c] !== '1') return;
  grid[r][c] = '0';                      // mark visited by mutation
  sink(grid, r+1, c); sink(grid, r-1, c);
  sink(grid, r, c+1); sink(grid, r, c-1);
}
// count islands = scan all cells, sink() on every unvisited '1', count the calls
```
```js
// Topo sort by indegree (Kahn): can you finish all courses?
const indeg = Array(n).fill(0), adj = Array.from({length:n}, () => []);
for (const [a, b] of edges) { adj[b].push(a); indeg[a]++; }
const q = []; for (let i = 0; i < n; i++) if (!indeg[i]) q.push(i);
let done = 0;
while (q.length) {
  const u = q.shift(); done++;
  for (const v of adj[u]) if (--indeg[v] === 0) q.push(v);
}
return done === n;                       // leftovers ⇒ a cycle
```
**Complexity:** O(V + E) for everything here — nodes plus edges, each touched once.

## Say this in the interview
"I'll model it as a graph: cells are nodes, adjacency is edges. Flood-fill each unvisited component — visiting marks cells so each is processed once, O(rows×cols). For prerequisites: Kahn's algorithm; if processed count < n, there's a cycle, so it's impossible."

## Now grind ⬇
Number of islands (flood fill) → rotting oranges (multi-source BFS with minutes = levels) → course schedule (topo/cycle). Three problems, three weapons.
