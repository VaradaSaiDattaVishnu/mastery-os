A key is React's identity signal for a list element: matching key means update in place; missing or changed key means unmount the old element and mount a new one from scratch.

## The core

When React reconciles a list, it needs to match fibers from the previous render to fibers in the new render. Without keys, it falls back to position matching — element at index 0 maps to element at index 0. This works only when the list never reorders, filters, or inserts.

With keys, React builds a map `key → fiber` before reconciling. If the same key appears in both the old and new maps, React updates that fiber (preserving its state). If a key is new, React mounts. If a key disappears, React unmounts.

```tsx
// Position-based (no key, or index as key): inserting at top remounts everything
const list = items.map((item, i) => (
  <Row key={i} data={item} />
))
// Inserting a new item at index 0 shifts all existing items.
// React sees key=0 changed data → updates; key=1 changed data → updates…
// None of the Row components preserve their internal state.

// Stable identity key: inserting at top only mounts the new item
const list = items.map((item) => (
  <Row key={item.id} data={item} />
))
// React sees key="new-id" is new → mount.
// All existing keys still match their fibers → update props, preserve state.
```

**When forced remount is the right answer**: sometimes you *want* React to throw away the old tree and start fresh. Changing the key accomplishes this deliberately.

```tsx
// Resetting a form when the selected user changes:
// Without key — the form retains its internal state from the previous user
<EditForm userId={selectedUserId} />

// With key — React unmounts and remounts cleanly on userId change
<EditForm key={selectedUserId} userId={selectedUserId} />
// No useEffect cleanup needed; mount = fresh state.
```

React's list reconciliation is O(n) with keys because it uses the key map for lookups. Without keys (or with index keys in a sortable list), it degrades toward O(n²) in some pathological cases and always produces unnecessary DOM mutations.

```tsx
// Wrong key source: derived from render-time data that isn't stable
// Math.random() produces a new key every render — every item remounts
items.map(item => <Row key={Math.random()} data={item} />)

// Wrong key source: array index with a filterable/sortable list
// Filtering [A,B,C] to [B,C] leaves B at index 0 — React updates A's fiber with B's data
items.filter(x => x.active).map((item, i) => <Row key={i} data={item} />)
```

## In your project

In scale-quest, game state is rendered as dynamic lists of nodes (challenge cards, level tiles, result entries). Early versions used array indexes as keys. Inserting a completed-challenge badge at the top of the list caused every card below to re-render with wrong animation state — the "completed" CSS class from one card leaked into the next because React reused the fiber. Switching to `challenge.id` as key fixed both the rendering correctness and eliminated the animation flicker.

## Tradeoffs & pitfalls

- **Stable IDs are not always available**: for lists of primitives or unsaved draft items, generate a stable ID at creation time (e.g., `crypto.randomUUID()` or a ULID), not at render time.
- **Keying expensive components for reset vs controlling them**: the key-reset pattern is a blunt instrument. If only one piece of state needs resetting, prefer a controlled component with an explicit reset prop or `useImperativeHandle`. Key-reset throws away all state, including scroll position and focused element.
- **Keys must be unique within a sibling list, not globally**: the same key can appear in different lists without conflict. React only compares within the same parent.

## Top-1% insight

The key-as-identity-reset pattern eliminates entire categories of `useEffect` cleanup code. Instead of writing `useEffect(() => { resetForm() }, [userId])`, using `key={userId}` means React handles the reset as a natural consequence of reconciliation. This is often cleaner, but it has a hidden cost: **unmounting fires all cleanup effects**. If your component has expensive teardown (canceling requests, closing sockets), a key change triggers it. Measure before choosing between the two approaches.
