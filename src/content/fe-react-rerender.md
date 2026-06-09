React re-renders a component when its parent re-renders or its state/context changes; referential equality — not value equality — is what `React.memo`, `useMemo`, and `useCallback` guard against.

## The core

By default, every time a parent renders, all its children render too, regardless of whether props changed. This is fine for cheap trees; it becomes a problem when children are expensive or when the tree is deep.

`React.memo` wraps a component and shallowly compares each prop by reference (`===`). If all props are the same reference as last render, the component is skipped. The key word is *reference*: a primitive `42` is always `=== 42`, but `{}` is a new object on every render even if its contents are identical.

```tsx
// Without memo — re-renders on every parent render
const Row = ({ label, value }: { label: string; value: number }) => (
  <div>{label}: {value}</div>
)

// With memo — skips render when label and value references are unchanged
const Row = React.memo(({ label, value }: { label: string; value: number }) => (
  <div>{label}: {value}</div>
))
```

`useMemo` memoizes a computed value; `useCallback` memoizes a function reference. Both take a dependency array and only recompute when a dep changes. They exist to preserve referential equality across renders so that `memo`-wrapped children can skip.

```tsx
function DataGrid({ rawData }: { rawData: Record<string, number>[] }) {
  // Without useMemo: new array reference every render → Row always re-renders
  const rows = React.useMemo(
    () => rawData.map(d => ({ label: d.name, value: d.score })),
    [rawData]
  )

  // Without useCallback: new function reference every render
  const handleClick = React.useCallback((id: string) => {
    console.log('clicked', id)
  }, []) // stable — no deps

  return rows.map(r => <Row key={r.label} {...r} onClick={handleClick} />)
}
```

**Context pitfall**: `React.createContext` re-renders every consumer whenever the context value changes by reference. A common mistake is providing an object literal as the value — it is a new reference on every parent render.

```tsx
// Bug: new object every render → all consumers re-render
<AuthContext.Provider value={{ user, logout }}>

// Fix: stabilize the value
const value = React.useMemo(() => ({ user, logout }), [user, logout])
<AuthContext.Provider value={value}>
```

The scalable fix for large context trees is **context splitting**: separate frequently-changing state (e.g., cursor position) from stable state (e.g., user object) into different contexts. Consumers only subscribe to what they need.

## In your project

At CUBE, the 2.5× interaction speed improvement came from auditing the component tree with React DevTools Profiler. The findings: a top-level context value was reconstructed on every keystroke (same object-literal pattern above), triggering re-renders across 40+ components. Memoizing the context value and wrapping the most expensive leaf components with `React.memo` dropped the per-interaction render time from ~180ms to ~70ms.

## Tradeoffs & pitfalls

- **Memoization has a cost**: `useMemo` and `useCallback` allocate closures, run the deps comparison, and store the cached value. For components that render rarely or cheaply, the overhead can exceed the savings. Profile before adding.
- **memo bypasses are silent**: if you pass an unstabilized callback or object as a prop, `memo` fails silently — the component re-renders anyway and you've added overhead for nothing. Use the Profiler "why did this render?" feature.
- **State inside memo**: `React.memo` only guards against parent-triggered re-renders. A memoized component re-renders normally when its own `useState` or `useContext` changes.

## Top-1% insight

`useCallback(fn, deps)` is exactly `useMemo(() => fn, deps)` — they are the same mechanism. React exposes both only for readability. This means `useCallback` does not prevent the function body from being created on every render; it prevents a *new reference* from being assigned. If your callback does expensive work, `useCallback` does not help — you need `useMemo` on the result, or to move the computation out of the render path entirely.
