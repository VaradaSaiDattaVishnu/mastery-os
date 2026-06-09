State has three fundamentally different natures — local UI state, global application state, and server cache — and conflating them is the root cause of most "state management" complexity in production apps.

## The core

**Local state** belongs to a single component and its descendants. It has no meaning outside that subtree. Form input values, toggle open/close, hover state — all local. `useState` is the right tool. Lifting it higher than necessary creates unnecessary coupling and re-renders.

**Global application state** is derived from user actions and must be consistent across distant parts of the UI simultaneously. Auth session, selected theme, a shopping cart — these span routes and component trees. Redux, Zustand, or Context (sparingly) are the tools.

**Server cache** is the state of remote data at a point in time. It is not owned by the client; it goes stale; it must be refreshed. React Query / SWR treat it as a cache with a TTL, not as application state. Storing server data in Redux and manually invalidating it is reimplementing a cache, badly.

```ts
// Taxonomy applied
const [isOpen, setIsOpen] = useState(false)          // local — drawer open state
const { user } = useAuthStore()                       // global — auth session
const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: fetchOrders })
// ^ server cache — React Query handles stale/refetch/loading
```

**Colocation principle**: state should live as close to where it's used as possible. Start with `useState` inside the component. Lift only when a sibling genuinely needs it. Move to global store only when lifting would require threading props through 3+ layers (prop drilling) or when the state must survive navigation.

```tsx
// Anti-pattern: global store for UI state
// Every interaction dispatches to Redux, every connected component re-renders
const { isModalOpen } = useSelector(s => s.ui.isModalOpen)

// Better: local state stays local
function SettingsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  return (
    <>
      <button onClick={() => setIsModalOpen(true)}>Open</button>
      {isModalOpen && <SettingsModal onClose={() => setIsModalOpen(false)} />}
    </>
  )
}
```

**Derived state** is not state at all — it is a computation over existing state. Never store derived values in state (double source of truth → sync bugs). Compute them inline or memoize with `useMemo`.

```tsx
// Bug: derived state stored separately
const [items, setItems] = useState([])
const [count, setCount] = useState(0) // must be kept in sync manually

// Correct: derive
const count = items.length
```

## In your project

Across all your projects, the most common structural error is server data in application state. In Unity's 15-module app with 38 models, early versions stored fetched Mongo documents in Redux slices. The result: manual loading/error flags, manual invalidation on mutation, optimistic update complexity. The right model is a server-cache layer (React Query or similar) sitting between the network and the UI, with Redux reserved for genuinely client-owned state like active module selection or draft edits.

## Tradeoffs & pitfalls

- **Context for server data**: passing server data through Context re-renders every consumer on every refetch, not just components that display changed fields. Use a query library or a store with per-field subscriptions.
- **Too much in local state**: if the same data is needed in a sibling that is not a descendant, local state is wrong. Lifting is the answer; do not reach for global state prematurely.
- **useState vs useReducer**: prefer `useReducer` when the next state depends on the current state in non-trivial ways, or when multiple sub-values are updated together. It makes transitions explicit and testable.

## Top-1% insight

The real diagnosis question is not "where should this state live?" but "who owns the right to change this state?" Ownership determines placement. Server data is owned by the server — the client has a snapshot. Auth state is owned by the auth provider — the client reflects it. A modal's open/close is owned by the component that renders the trigger. When you reason about ownership first, the taxonomy follows naturally and you avoid both under-centralization (prop drilling) and over-centralization (global store bloat).
