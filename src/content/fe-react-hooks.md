Hooks store state in a linked list of nodes on the fiber; each call to `useState` or `useEffect` reads the next node in order — which is exactly why the rules of hooks (no conditionals, no loops) are not style preferences but runtime invariants.

## The core

When a component renders, React maintains a **memoized state queue** on the fiber. The first render builds the linked list; every subsequent render traverses it in the same order. If you call hooks conditionally, the node at position 3 on the second render may be a different hook than on the first — React reads the wrong state cell and produces nonsense.

```tsx
// The linked list React builds internally (simplified):
// useState(0)  → { memoizedState: 0, next: → }
// useState('')  → { memoizedState: '', next: → }
// useEffect(fn) → { create: fn, deps: [], next: null }
```

**Stale closures** are the most common hook bug. Every render creates a new closure over the current values of state and props. An effect or event handler that captures variables from a particular render will always see that render's snapshot — even after state has moved on.

```tsx
// Bug: n is stale inside the interval
function Counter() {
  const [n, setN] = React.useState(0)

  React.useEffect(() => {
    const id = setInterval(() => {
      setN(n + 1) // always reads n=0 from the first render's closure
    }, 1000)
    return () => clearInterval(id)
  }, []) // empty deps — effect never re-runs, closure never refreshes

  return <div>{n}</div>
}

// Fix: use the functional updater — no closure dependency on n
React.useEffect(() => {
  const id = setInterval(() => {
    setN(prev => prev + 1) // reads from the update queue, not the closure
  }, 1000)
  return () => clearInterval(id)
}, [])
```

`useRef` escapes the closure problem by providing a mutable container whose `.current` identity is stable across renders. The value is not reactive — changing it does not trigger a re-render — but it always reads the latest assignment.

```tsx
// useRef for stable mutable access without re-render
function Timer() {
  const countRef = React.useRef(0)

  React.useEffect(() => {
    const id = setInterval(() => {
      countRef.current += 1
      console.log('tick', countRef.current) // always current
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return null
}
```

The dependency array of `useEffect` is a promise to React: "re-run this effect when these values change." Omitting a dependency is not an optimization — it is a lie that produces stale data. `eslint-plugin-react-hooks` enforces correct deps; treat its warnings as errors.

## In your project

JARVIS's voice pipeline runs a WebSocket loop that processes audio chunks and calls tools. The stale-closure problem is acute here: the active tool call ID captured at subscription time must stay in sync with the latest server response. The fix is `useRef` for the mutable cursor plus `useEffect` re-runs keyed to the session ID when it changes.

ToDoApp's NLP processing hooks use `useEffect` to debounce text analysis. Without a proper cleanup return value, the analysis from a previous input could resolve after the user's current input, causing ghost completions — classic async stale-closure with an additional race.

## Tradeoffs & pitfalls

- **Over-listing deps**: listing an object or array literal in deps (`useEffect(() => {}, [{}])`) creates a new reference every render and the effect runs every time. Stabilize with `useMemo` or move the value inside the effect.
- **useLayoutEffect on the server**: it fires synchronously on the client but cannot fire during SSR, producing a hydration warning. Use `useEffect` or suppress with a `useIsomorphicLayoutEffect` shim.
- **Cleanup ordering**: React 18 in Strict Mode mounts → unmounts → remounts every effect in development. This surfaces missing cleanups. If your effect assumes it runs once per lifetime, you have a bug.

## Top-1% insight

`useState`'s setter is **referentially stable** — it is guaranteed not to change between renders. You can safely omit it from `useEffect` deps. But the value it sets is not stable. This asymmetry is load-bearing: it's why `setN` can appear in a `useCallback([])` without causing staleness, while `n` itself cannot. React achieves setter stability by storing the dispatch function on the fiber's update queue, not in the closure.
