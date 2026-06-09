Every DOM event travels down the tree in the capture phase and back up in the bubble phase; pointer events unify mouse, touch, and stylus input; and pointer capture ensures a drag operation continues even when the pointer leaves the target element.

## The core

The **event propagation model** has three phases. Capture phase: the event travels from `window` down to the target. Target phase: handlers on the target fire. Bubble phase: the event travels back up to `window`. Most handlers attach to the bubble phase (`addEventListener('click', fn)` or `onClick` in React). Capture phase handlers attach with `{ capture: true }` and fire before any descendant's bubble handler.

```ts
// Capture phase — fires before any descendant's handler
document.addEventListener('click', (e) => {
  console.log('capture', e.target)
}, { capture: true })

// Bubble phase (default) — fires after descendants
document.addEventListener('click', (e) => {
  console.log('bubble', e.target)
})

// Stop propagation: prevents the event reaching further handlers in the chain
element.addEventListener('click', (e) => {
  e.stopPropagation() // stops bubbling — parent handlers do not fire
  e.stopImmediatePropagation() // stops all remaining handlers on this element too
})
```

**Pointer events** replace mouse and touch events with a unified model. `pointerdown`, `pointermove`, `pointerup`, `pointercancel` work identically for mouse, touch, and stylus. `pointerType` ('mouse' | 'touch' | 'pen') lets you adapt behavior. For pinch-to-zoom, track two active pointer IDs separately.

```ts
// Pan implementation using pointer events
const state = { active: false, startX: 0, startY: 0, tx: 0, ty: 0 }

canvas.addEventListener('pointerdown', (e) => {
  state.active = true
  state.startX = e.clientX - state.tx
  state.startY = e.clientY - state.ty
  canvas.setPointerCapture(e.pointerId) // capture: moves fire on canvas even off-element
})

canvas.addEventListener('pointermove', (e) => {
  if (!state.active) return
  state.tx = e.clientX - state.startX
  state.ty = e.clientY - state.startY
  canvas.style.transform = `translate(${state.tx}px, ${state.ty}px)`
})

canvas.addEventListener('pointerup', () => { state.active = false })
canvas.addEventListener('pointercancel', () => { state.active = false })
```

**Pointer capture** (`element.setPointerCapture(pointerId)`) is critical for drag operations. Without it, if the pointer moves faster than the animation frame and leaves the element's bounding box, the `pointermove` event fires on whatever element is under the pointer — not the drag handle. Pointer capture routes all subsequent pointer events for that `pointerId` to the capturing element until `pointerup` or `pointercancel`.

**Passive listeners** are an opt-in hint to the browser: "this handler will never call `preventDefault()`." The browser can then scroll immediately on the compositor thread without waiting for your JS to run.

```ts
// Passive: browser can scroll without waiting for this to finish
window.addEventListener('wheel', handleWheel, { passive: true })

// Non-passive (default): browser must wait to check if you call preventDefault()
// This adds latency to every scroll event
window.addEventListener('wheel', handlePreventableWheel)
```

## In your project

Your Portfolio's pan/zoom canvas uses exactly this model. `setPointerCapture` is what keeps the pan working when you drag off the canvas edge onto the toolbar. Without it, a fast drag releases onto the toolbar element, which fires its own `pointerdown` handlers and leaves the canvas in an active-but-not-dragging state. Capture locks the event stream to the canvas for the duration of the drag.

## Tradeoffs & pitfalls

- **event.preventDefault() on touch events**: calling `preventDefault()` on a `touchstart` or `touchmove` (or their pointer event equivalents) suppresses native scrolling. This is sometimes needed (gesture control), but must be done intentionally and the listener must be non-passive.
- **stopPropagation abuse**: using `stopPropagation` to prevent a parent handler from firing is a leak — it also prevents analytics event listeners, focus management handlers, and modal close handlers from seeing the event. Prefer event delegation or explicit condition checks.
- **Click vs pointerdown delay**: mobile browsers add a 300ms delay to `click` events to detect double-taps. On modern browsers with `touch-action: manipulation` CSS, this delay is removed. Use CSS before reaching for `fastclick` libraries.

## Top-1% insight

React uses **event delegation**: it attaches a single listener at the root (`document` in React 17, the root container in React 18) for every event type, then dispatches to the correct component via the fiber tree. This means `e.nativeEvent.stopPropagation()` in a React handler only stops real DOM bubbling — it does not stop React's synthetic event from reaching React handlers on ancestors. To stop a React event from reaching a React ancestor, use `e.stopPropagation()` (the synthetic event's version). This distinction matters when mixing React and non-React event listeners on the same elements.
