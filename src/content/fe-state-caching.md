Client caching means storing the server's response locally and serving it from memory on subsequent requests, invalidating only when the data is known to have changed — the discipline that turned CUBE's dashboard from chatty to quiet.

## The core

The **cache-aside** (lazy loading) pattern: on a request, check the cache first. On a miss, fetch from the network, store the result keyed by a stable identifier, and return it. On a hit, return the cached value without a network call. This is what React Query and RTK Query implement.

The cache key is everything. It must be deterministic, specific enough to not collide, and coarse enough to be reusable. React Query uses arrays for this: `['orders', userId, { status: 'open' }]` serializes to a stable JSON key.

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Cached fetch — subsequent renders with same key return instantly
function OrderList({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['orders', userId],
    queryFn: () => fetchOrders(userId),
    staleTime: 60_000,  // treat as fresh for 60s — no refetch even on focus
    gcTime: 5 * 60_000, // keep in memory for 5min after last subscriber
  })

  if (isLoading) return <Skeleton />
  return data?.map(o => <OrderRow key={o.id} order={o} />)
}
```

**Invalidation** is how you tell the cache that data has changed. The key design decision: invalidate by key prefix (broad) or exact key (narrow). React Query's `invalidateQueries` marks matching entries stale and triggers a background refetch for any active subscriber.

```tsx
function CancelOrderButton({ orderId, userId }: { orderId: string; userId: string }) {
  const queryClient = useQueryClient()

  const { mutate } = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => {
      // Invalidate the exact list — triggers refetch for mounted components
      queryClient.invalidateQueries({ queryKey: ['orders', userId] })
      // Or optimistically remove from cache immediately:
      queryClient.setQueryData(['orders', userId], (prev: Order[]) =>
        prev?.filter(o => o.id !== orderId)
      )
    },
  })

  return <button onClick={() => mutate()}>Cancel</button>
}
```

**Request deduplication** is automatic: if two components mount simultaneously and both call `useQuery` with the same key, React Query issues exactly one network request and delivers the result to both. This eliminates the most common cause of N×1 network waterfalls in component-driven UIs.

```tsx
// Both components trigger the same useQuery key — single network request
function Header() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe })
}
function Sidebar() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe })
}
```

## In your project

At CUBE, the −90% network reduction came from identifying that every route change re-fetched the same dashboard data. The data was fetched imperatively in Redux thunks with no deduplication and no stale-time. Migrating to React Query with a 60-second `staleTime` meant that navigating within the app served from cache; only background refetches happened. The second lever was setting `gcTime` high enough that returning to a route within a session never triggered a spinner.

## Tradeoffs & pitfalls

- **staleTime vs gcTime confusion**: `staleTime` controls when data is considered stale (and a background refetch is triggered). `gcTime` controls when the cache entry is garbage collected. Setting `staleTime: Infinity` means the data never auto-refreshes — fine for static reference data, catastrophic for live counts.
- **Cache key collisions**: sharing a cache key between components that expect different data shapes produces silent type errors. Namespacing by domain (`['inventory', 'products']`, not just `['products']`) prevents this.
- **Optimistic updates must handle rollback**: `setQueryData` on `onMutate` gives instant UI feedback. You must restore the previous data in `onError`. Forgetting the rollback leaves the UI in a corrupted state when the network fails.

## Top-1% insight

React Query's `staleTime: 0` (the default) means data is immediately stale after fetching, but it is **not refetched until an event triggers it** (window focus, component remount, explicit invalidation). The data still serves from cache between events. This is often misunderstood as "no caching" — in reality it is "cache with immediate staleness, served until a trigger fires." Setting `refetchOnWindowFocus: false` disables the most common trigger, turning it effectively into `staleTime: Infinity` for focused-tab usage, which is often what you actually want for dashboards that self-refresh on user action.
