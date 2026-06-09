Redux Toolkit eliminates the boilerplate of classic Redux through Immer-backed slices and `createAsyncThunk`, while `reselect` memoized selectors and entity adapters provide the normalization needed for predictable state at scale.

## The core

RTK's `createSlice` generates actions and a reducer from a single object. Under the hood, it wraps the reducer in Immer, which uses JavaScript Proxies to let you write apparently-mutating logic that produces an immutable update. This means no more spread chains.

```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface OrdersState {
  ids: string[]
  entities: Record<string, Order>
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
}

const ordersSlice = createSlice({
  name: 'orders',
  initialState: { ids: [], entities: {}, status: 'idle' } as OrdersState,
  reducers: {
    upsertOrder(state, action: PayloadAction<Order>) {
      const order = action.payload
      if (!state.ids.includes(order.id)) state.ids.push(order.id)
      state.entities[order.id] = order // Immer makes this safe
    },
  },
})
```

**Normalization** is storing entities in a flat `{ ids: string[], entities: Record<id, Entity> }` shape rather than nested arrays. RTK's `createEntityAdapter` generates this shape and the standard CRUD reducers for free. The benefit: updating one entity is O(1) and does not invalidate the reference to any other entity.

```ts
import { createEntityAdapter } from '@reduxjs/toolkit'

const ordersAdapter = createEntityAdapter<Order>()
// Gives: ordersAdapter.upsertOne, ordersAdapter.removeOne, ordersAdapter.setAll, etc.
// State shape: { ids: ['1','2'], entities: { '1': Order, '2': Order } }

const ordersSlice = createSlice({
  name: 'orders',
  initialState: ordersAdapter.getInitialState({ status: 'idle' }),
  reducers: {
    upsertOrder: ordersAdapter.upsertOne,
  },
})
```

**Memoized selectors** with `createSelector` (re-export of Reselect) prevent derived computations from running on every dispatch. They only recompute when their input selectors return new references.

```ts
import { createSelector } from '@reduxjs/toolkit'

const selectOrders = (state: RootState) => state.orders.entities
const selectUserId = (_: RootState, userId: string) => userId

// Only recomputes when orders or userId changes
export const selectUserOrders = createSelector(
  [selectOrders, selectUserId],
  (entities, userId) =>
    Object.values(entities).filter(o => o.userId === userId)
)
```

## In your project

At CUBE, RTK caching (via RTK Query, not manual reducers) eliminated redundant network requests across the dashboard. In ToDoApp, a normalized slice for tasks meant that marking one task complete only updated `entities['task-id']` — sibling tasks' selectors returned the same reference and their components did not re-render. Before normalization, tasks were stored as an array; updating one item replaced the whole array reference, re-rendering the entire list.

## Tradeoffs & pitfalls

- **Immer is not free**: Immer's Proxy overhead is measurable for extremely large state objects (10k+ entities). For very hot paths, prefer returning a new object manually — Immer lets you mix both styles.
- **createAsyncThunk and loading state**: the three-state (`pending/fulfilled/rejected`) pattern is verbose for every async operation. RTK Query replaces this for server data — use `createAsyncThunk` only for truly client-owned async operations (e.g., reading from IndexedDB).
- **Selector equality**: `createSelector` uses reference equality for each input by default. If an input selector returns a new object reference every call (e.g., `state => state.filter(...)` inline), the memoization never helps. Input selectors must return stable references.

## Top-1% insight

RTK's `createSelector` has a cache size of 1 by default — it caches the result of the last unique input combination only. This means a selector called with different arguments in different components (e.g., `selectUserOrders(state, 'user-1')` and `selectUserOrders(state, 'user-2')`) will cache-miss on every alternating call. The fix is `createSelectorCreator` with a LRU cache, or per-instance selectors created with a factory function inside `useMemo`. This is the single most common source of "my selectors are slow even with Reselect" bugs in large codebases.
