**"Longest / shortest / max subarray-or-substring with condition" → sliding window.** Grow the right edge; when the rule breaks, shrink from the left. Every element enters once and leaves once: O(n).

## Spot it
- "Longest substring without repeats", "max sum of k consecutive", "smallest subarray with sum ≥ s", "longest with at most k …".
- Keyword pair: **contiguous** + **best length/sum**.

## The move
```js
let l = 0, best = 0;
const state = new Map();                 // whatever tracks the rule
for (let r = 0; r < s.length; r++) {
  // 1. absorb s[r] into state
  while (/* state violates the rule */) {
    // 2. evict s[l] from state; l++
  }
  best = Math.max(best, r - l + 1);      // 3. window is valid here
}
```
Fixed-size windows (sum of k) are simpler: add the entering element, subtract the leaving one — never re-sum.

**Complexity:** O(n) — l and r each move forward at most n times. O(k) space for the state.

## Say this in the interview
"This asks for the best *contiguous* run under a condition, so I'll slide a window: expand right, and shrink left only while the invariant is broken. Both pointers only move forward, so it's linear despite the nested while."

## Now grind ⬇
Fixed window first (warm-up), then the famous no-repeat substring, then variable-shrink (min length ≥ target), then "at most k replacements" — the one that separates candidates.
