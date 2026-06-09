Virtualization renders only the rows currently visible in the viewport plus a small overscan buffer, keeping the DOM node count constant regardless of dataset size — the technique that makes 100k rows feel instant.

## The core

A naively rendered list with 100,000 rows creates 100,000 DOM nodes. Even with `display: none`, the browser holds all of them in the layout tree, performing style recalculation and memory allocation for each. At ~1,500 rows the frame budget breaks down on most hardware.

Virtualization replaces the DOM nodes with a fixed window of visible nodes. A scroll container with a total height equal to `rowCount × rowHeight` creates the correct scrollbar. Absolutely-positioned items are rendered only within the visible range, each translated to their correct `y` position. As the user scrolls, old items are recycled and new items are populated with different data.

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualTable({ rows }: { rows: Row[] }) {
  const parentRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,     // px per row (estimate for variable height)
    overscan: 10,               // render 10 extra rows above/below viewport
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      {/* Spacer — sets total scroll height */}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}  // enables variable row height measurement
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              width: '100%',
            }}
          >
            <RowComponent data={rows[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Variable row heights** require measuring rendered rows and updating the size cache. `measureElement` (via a ref callback) tells the virtualizer the actual rendered height after the DOM paints, so it can correct the estimated sizes and reposition subsequent rows. This introduces one frame of layout reflow, but only for rows entering the viewport.

**Layout thrash** is the killer: reading a layout property (e.g., `offsetHeight`) then writing a style in the same frame forces the browser to flush pending styles and recalculate layout. In a virtualizer, this happens when you read scroll position, compute which rows to render, then write their transforms. The fix is to batch reads before writes — `requestAnimationFrame` or a scheduler handles this automatically in production virtualizers.

## In your project

At CUBE, the 100k-row grid used a custom tree filter. The virtualization work was paired with an O(n²) → O(n) filter fix: the original filter walked the tree for every node to check parent inclusion, producing quadratic growth. The fix pre-computed a parent-inclusion set in a single O(n) pass, then filtered in a second O(n) pass. Virtualization controlled the DOM; the algorithm controlled the data path. Both had to be solved — virtualization alone would have rendered a filtered list instantly but the filter itself was still slow.

## Tradeoffs & pitfalls

- **Overscan too small**: tiny overscan creates visible blank rows on fast scroll. Overscan of 5–15 rows is standard; increase for fast-scrolling users (e.g., keyboard navigation with Page Down).
- **Dynamic heights without measureElement**: estimating a fixed height for variable-height rows causes incorrect scroll positions and jumpy behavior when the user scrolls back up. Always use `measureElement` for variable content.
- **Nested scroll containers**: a virtualizer inside a virtualizer (e.g., a virtualized tree with virtualized children) requires careful scroll-event routing and is rarely worth the complexity. Prefer flat data with indentation levels.

## Top-1% insight

The browser's `IntersectionObserver` is often proposed as an alternative to full virtualization: observe each row, unmount when off-screen. This is worse in almost every scenario. The problem is that unmounted rows still occupy their layout space (you must leave a placeholder), and `IntersectionObserver` callbacks fire asynchronously — meaning rows flash blank before they are remounted. True virtualization uses the scroll position synchronously in `onScroll` to calculate the visible range before the next paint, producing no visible blank regions. The synchronous read of `scrollTop` is the key architectural difference.
