The browser renders frames through a pipeline ending in compositing; animating only `transform` and `opacity` keeps animations on the GPU compositor thread, bypassing layout and paint entirely — the path to consistent 60fps.

## The core

The browser rendering pipeline for a frame: **Style** → **Layout** → **Paint** → **Composite**. Each stage feeds the next:

- **Layout (reflow)**: calculates geometry — every element's position and size. Triggered by changes to dimensions, padding, margin, font size, or anything that affects box model.
- **Paint**: rasterizes styled elements into bitmap layers. Triggered by color, background, shadow changes.
- **Composite**: assembles layers and sends them to the GPU. Only `transform` and `opacity` changes reach this stage without triggering the earlier ones.

Animating `width`, `height`, `top`, `left`, or `margin` triggers layout on every frame — potentially hundreds of thousands of operations for a complex tree. At 60fps, you have 16.7ms per frame. A 10ms layout flush leaves no budget for script, paint, or user events.

```css
/* Triggers layout every frame — DO NOT animate these for smooth motion */
.bad-animate {
  animation: slide-bad 0.3s ease;
}
@keyframes slide-bad {
  from { left: -100px; }
  to   { left: 0; }
}

/* Compositor-only — stays on GPU thread, no layout, no paint */
.good-animate {
  animation: slide-good 0.3s ease;
  will-change: transform; /* hints browser to promote to own layer before animation */
}
@keyframes slide-good {
  from { transform: translateX(-100px); }
  to   { transform: translateX(0); }
}
```

`will-change: transform` tells the browser to promote the element to its own **compositor layer** before the animation starts — avoiding a one-frame hitch on the first frame. Use it sparingly; every promoted layer consumes GPU memory.

For JavaScript-driven animations, read layout properties outside the animation loop and write transforms inside `requestAnimationFrame`:

```ts
// Layout thrash: read and write alternating in a loop
function badAnimation(element: HTMLElement) {
  const frames = 60
  let i = 0
  function step() {
    const width = element.offsetWidth // READ: forces layout flush
    element.style.left = `${i}px`    // WRITE: invalidates layout
    if (++i < frames) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// Correct: read once, write transform in rAF
function goodAnimation(element: HTMLElement) {
  let progress = 0
  function step(timestamp: number) {
    progress = Math.min(timestamp / 300, 1) // normalized 0→1
    element.style.transform = `translateX(${progress * 100}px)` // compositor only
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
```

The **Web Animations API** (WAAPI) lets the browser run animations off the main thread entirely when they only use compositor properties:

```ts
element.animate(
  [{ transform: 'translateX(-100px)' }, { transform: 'translateX(0)' }],
  { duration: 300, easing: 'ease-out', fill: 'forwards' }
)
```

## In your project

Your Portfolio's spatial canvas uses pan/zoom interactions. The naive implementation used `left/top` positioning updated on `pointermove`. Switching to `transform: translate(x, y) scale(z)` and applying the value directly to the canvas element's style in a `rAF` loop (not through React state) kept pan/zoom at 60fps even on large content. React's re-render cycle is entirely bypassed for the animation — state updates only on pointer release.

## Tradeoffs & pitfalls

- **will-change abuse**: applying `will-change: transform` to dozens of elements simultaneously exhausts GPU memory. Use it only on elements about to animate, and remove it after animation completes.
- **Forced synchronous layout (FSL)**: calling `getBoundingClientRect()`, `scrollTop`, `offsetHeight` immediately after a DOM write forces the browser to flush pending layouts synchronously. In a tight loop this is catastrophic. Use `ResizeObserver` or read layout properties before any writes in a given frame.
- **CSS vs JS animation**: CSS animations (and WAAPI) are preferable for timed, declarative sequences. JavaScript `rAF` loops are for animations driven by live input (scroll position, pointer coordinates, physics).

## Top-1% insight

Chrome's DevTools Performance panel shows frames in the "Frames" lane. A frame colored red exceeds 16.7ms — it dropped. Expanding the flame chart reveals whether the time was in "Recalculate Style," "Layout," "Paint," or "Composite Layers." Only after identifying which stage is the bottleneck does the fix become clear. Engineers who jump to `will-change` as a first resort without profiling often find it makes no difference because the bottleneck was in their script, not the paint stage. Measure the pipeline stage, then optimize that stage.
