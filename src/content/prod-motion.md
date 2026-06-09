Motion earns its place only when it carries meaning — it should tell the user what changed, what relates to what, and where they are in space.

## The core

The brain interprets motion as causality. When an element grows from a button, users understand the new surface originated there. When a panel slides in from the right, users build a spatial map: "right" means forward, the back button will slide it out to the right. These are not aesthetic choices — they are load-bearing communication that reduces cognitive effort on every subsequent interaction.

Three principles govern effective motion:

**Easing is intent.** `ease-out` (fast start, slow finish) feels physical, like an object decelerating — use it for things entering the screen. `ease-in` (slow start, fast finish) suits exits. `ease-in-out` suits internal transitions. Linear easing reads as mechanical and cold; reserve it for loading bars where constant velocity is appropriate. Custom cubic beziers let you express personality, but only after the above are correct.

**Duration scales with distance and importance.** A tooltip appearing 8px away should take ~100ms. A full-screen modal transition can take 300–400ms. Anything beyond 500ms on a routine interaction reads as lag, not polish.

**Choreography is sequencing.** When multiple elements animate together, they should not all start simultaneously. Stagger by 30–60ms to guide the eye. The primary content moves first; supporting elements follow. This is the difference between a UI that feels considered and one that explodes.

```css
/* Entering panel — ease-out, fast */
.panel-enter {
  animation: slideIn 280ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both;
}

/* Staggered children — each 40ms behind the previous */
.child:nth-child(1) { animation-delay: 0ms; }
.child:nth-child(2) { animation-delay: 40ms; }
.child:nth-child(3) { animation-delay: 80ms; }

/* Always provide a reduced-motion path */
@media (prefers-reduced-motion: reduce) {
  .panel-enter,
  .child { animation: none; transition: none; }
}
```

## In your project

Vishnu·OS (Portfolio) is a motion-driven spatial UI — pan, zoom, and element transitions are the primary navigation language. Without meaningful easing and choreography, the spatial metaphor collapses into visual noise. The `prefers-reduced-motion` fallback is not optional here; it is the accessibility contract for users with vestibular disorders who would experience nausea on the full motion version.

## Tradeoffs & pitfalls

Motion sickness is a real harm. Parallax, auto-playing animations, and anything that moves while the user is not interacting are the highest-risk patterns. The `prefers-reduced-motion` media query is widely supported — there is no valid reason to ignore it. A common mistake is treating reduced-motion as "no motion": instant, abrupt state changes are also disorienting. The correct fallback is a fast opacity fade or an instantaneous but visually coherent swap, not a hard cut.

Do not animate layout properties (`width`, `height`, `top`, `left`) — they force reflow on every frame. Animate `transform` and `opacity` exclusively; these run on the compositor thread and do not block the main thread.

## Top-1% insight

The most common motion error in portfolio-level work is animating everything. Senior engineers apply motion with scarcity — they ask "what information does this motion convey?" and delete the animation if the answer is "none." The second error is inconsistency: using `ease-out` for some entries and `linear` for others without a system. A mature motion design system defines three or four named easing tokens and two or three duration tokens, and every animation pulls from that set. The result is a product that feels coherent rather than busy.
