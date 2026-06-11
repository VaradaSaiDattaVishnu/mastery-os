**"Most recent unmatched thing" → stack.** Parentheses, undo, nearest-greater-element, expression evaluation — anything where the *last* open item is the *first* to resolve.

## Spot it
- Brackets/nesting, "evaluate expression", "next greater/warmer element", "remove adjacent pairs".
- The giveaway: processing left→right while occasionally *resolving backwards*.

## The move
```js
// Matching: push opens, pop on close
const stack = [];
for (const c of s) {
  if (isOpen(c)) stack.push(c);
  else if (stack.pop() !== matchOf(c)) return false;
}
return stack.length === 0;
```
```js
// Monotonic stack: indices of a strictly decreasing run
const stack = [];                         // holds INDICES
for (let i = 0; i < temps.length; i++) {
  while (stack.length && temps[i] > temps[stack.at(-1)]) {
    const j = stack.pop();
    res[j] = i - j;                       // i is j's "next greater"
  }
  stack.push(i);
}
```
Monotonic stacks answer "for each element, the next bigger/smaller one" in O(n) — each index is pushed and popped once.

**Complexity:** O(n) time, O(n) space.

## Say this in the interview
"Each element waits for its resolver — that's LIFO, so a stack. For next-greater I'll keep a decreasing stack of indices: when a warmer day arrives, it resolves everything colder on top. Push/pop once each → linear."

## Now grind ⬇
Brackets → RPN calculator → monotonic (daily temperatures) → then BUILD a MinStack class from scratch — design questions like it are FAANG staples.
