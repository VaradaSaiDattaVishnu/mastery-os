A graph is the most general relationship structure in CS — whenever you have entities and connections between them, you likely have a graph. Most real engineering problems (dependency resolution, routing, social networks, workflow execution) are graph problems in disguise.

## The core

**Vocabulary**: vertices (V) and edges (E). Graphs can be directed or undirected, weighted or unweighted, cyclic or acyclic (DAG = directed acyclic graph).

**Representations**:
- **Adjacency list** (`Map<V, V[]>`): O(V + E) space. Iterating neighbours of a node is O(degree). Best for sparse graphs (most real-world graphs).
- **Adjacency matrix** (`boolean[][]`): O(V²) space. Edge existence check is O(1). Best for dense graphs or when you need fast edge queries.

**Traversals** — both visit every reachable vertex once: O(V + E):

```ts
type Graph = Map<string, string[]>

// BFS — explores layer by layer; finds shortest path in unweighted graphs
function bfs(graph: Graph, start: string): string[] {
  const visited = new Set<string>()
  const queue: string[] = [start]
  const order: string[] = []
  visited.add(start)
  while (queue.length > 0) {
    const node = queue.shift()!
    order.push(node)
    for (const neighbour of graph.get(node) ?? []) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour)
        queue.push(neighbour)
      }
    }
  }
  return order
}

// DFS — goes deep first; used for cycle detection, topological sort
function dfs(graph: Graph, start: string, visited = new Set<string>()): string[] {
  if (visited.has(start)) return []
  visited.add(start)
  const order = [start]
  for (const neighbour of graph.get(start) ?? []) {
    order.push(...dfs(graph, neighbour, visited))
  }
  return order
}

// Topological sort (Kahn's algorithm — BFS-based, handles cycles explicitly)
function topoSort(graph: Graph): string[] | null {
  const inDegree = new Map<string, number>()
  for (const [node, neighbours] of graph) {
    if (!inDegree.has(node)) inDegree.set(node, 0)
    for (const n of neighbours) inDegree.set(n, (inDegree.get(n) ?? 0) + 1)
  }
  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([n]) => n)
  const result: string[] = []
  while (queue.length > 0) {
    const node = queue.shift()!
    result.push(node)
    for (const neighbour of graph.get(node) ?? []) {
      const d = (inDegree.get(neighbour) ?? 1) - 1
      inDegree.set(neighbour, d)
      if (d === 0) queue.push(neighbour)
    }
  }
  return result.length === graph.size ? result : null  // null = cycle detected
}
```

**Dijkstra's shortest path**: O((V + E) log V) with a min-heap. Greedily relaxes the cheapest unvisited node. Requires non-negative weights.

## In your project

The CUBE hierarchical tree is a DAG (directed acyclic graph) — each node has exactly one parent, making it a tree (a special graph). Understanding this lets you apply topological sort to process parent nodes before children (e.g., when computing inherited filter states), ensuring a parent's state is resolved before its children consume it.

Dependency graphs appear throughout the system: Turborepo's task graph (which package must build before another), module bundlers (which import must resolve first), and database migration ordering all require topological sort. Any time you see "must happen before" relationships, reach for a DAG + topo sort.

## Tradeoffs & pitfalls

- **Forgetting the `visited` set**: without it, any cycle causes infinite traversal. Always mark a node *before* enqueueing/recursing, not after processing — or you'll enqueue it multiple times.
- **`queue.shift()` is O(n)**: JavaScript arrays are not efficient queues. For serious BFS, use a proper deque or index pointer (`let head = 0; queue[head++]`).
- **BFS vs DFS choice**: BFS finds the *shortest* path in unweighted graphs; DFS does not. For weighted shortest paths, use Dijkstra's (non-negative weights) or Bellman-Ford (negative weights).
- **Adjacency matrix for sparse graphs**: V = 10 000, E = 20 000 → adjacency matrix wastes 100M cells; adjacency list uses 30 000 entries.

## Top-1% insight

**Graph problems are often about what you model as a node vs an edge.** The algorithm is rarely the hard part — the hard part is the mapping. In Dijkstra's applied to word-ladder (change one letter at a time), the nodes are words and edges connect words differing by one character. In a scheduling problem, states become nodes and transitions become edges. Once the model is right, standard BFS/DFS/Dijkstra applies mechanically. In an interview, spend the first few minutes explicitly naming your nodes, edges, and directedness — this demonstrates senior-level thinking and usually unlocks the algorithm instantly.
