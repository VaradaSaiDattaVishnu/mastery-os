React's render phase produces a new fiber tree in memory; the commit phase applies the diff to the real DOM — a "render" never touches a pixel directly.

## The core

React operates in two distinct, non-overlapping phases:

**Render phase** (pure, interruptible in concurrent mode): React calls your component functions and reconciles the resulting fiber tree against the previous one. This is pure computation — no DOM writes happen here. React 18's concurrent renderer can pause, discard, or restart this work without side effects, which is why render functions must be pure.

**Commit phase** (synchronous, cannot be interrupted): React walks the effect list produced during reconciliation and mutates the DOM, then fires `useLayoutEffect` synchronously, then flushes `useEffect` asynchronously. Three sub-phases: `beforeMutation` (reads snapshot), `mutation` (DOM writes), `layout` (after DOM settles).

The **fiber** is React's internal unit of work — a JavaScript object that holds component type, props, state, the effect list, and pointers to parent/child/sibling fibers. Each component has one. On update, React creates an alternate fiber tree (the "work-in-progress" tree) and compares it to the current tree. When commit finishes, the two trees swap.

```tsx
// What React actually traverses when you write this:
function Counter() {
  const [n, setN] = React.useState(0)
  return <button onClick={() => setN(n + 1)}>{n}</button>
}

// Fiber shape (simplified):
// {
//   type: Counter,
//   memoizedState: { queue: ..., memoizedState: 0 },
//   child: FiberNode(button),
//   alternate: previousFiber,
//   flags: Update | Passive,
// }
```

The reconciler's diffing algorithm is O(n), not O(n³), because it makes two heuristics: elements of different types produce entirely new trees (no diffing), and elements of the same type at the same position update in place. That's why swapping a `<div>` to a `<section>` unmounts the entire subtree.

```tsx
// This remounts the child completely — React sees a type change
function Bad({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? <AdminPanel /> : <UserPanel />
  // Both are divs internally, but React treats them as new trees
}

// This preserves the child — same type, different props
function Better({ isAdmin }: { isAdmin: boolean }) {
  return <Panel role={isAdmin ? 'admin' : 'user'} />
}
```

## In your project

At CUBE, every interaction against the 100k-row grid triggered a render. Understanding that render ≠ paint was the entry point: profiling in React DevTools' "Profiler" tab showed render duration per component. The bottleneck was not the DOM — it was reconciliation across hundreds of visible fibers per state update. Cutting rendered fiber count (via virtualization + memoization) was the lever.

## Tradeoffs & pitfalls

- **Concurrent mode pitfall**: render functions can be called multiple times for a single commit. If you put a side effect inside the render path (e.g., incrementing a ref during render), it runs twice in `<StrictMode>` in development — by design, to surface impurity.
- **useLayoutEffect vs useEffect**: `useLayoutEffect` fires synchronously in the commit phase before the browser paints; `useEffect` fires after. Use `useLayoutEffect` only when you need to read layout (e.g., `getBoundingClientRect`) before the user sees the frame. Overusing it blocks paint.
- **Batching**: React 18 batches all state updates by default, even inside `setTimeout` and native event handlers. React 17 only batched inside React event handlers. This is almost always better, but can surprise you if you expected intermediate renders.

## Top-1% insight

The render phase is **referentially transparent** — same props and state must produce the same output. React 18 exploits this in Offscreen (hidden tabs, pre-rendering): it can render a tree that is not yet committed to the DOM, then commit it instantly when needed. Any impurity (reading `Date.now()`, mutating an external variable during render) breaks this contract silently — the UI shows stale data not because of a bug in React, but because you violated the invariant React's whole scheduling model depends on.
