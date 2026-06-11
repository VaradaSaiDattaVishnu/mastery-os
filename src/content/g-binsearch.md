**Sorted? Monotonic? "Minimum X such that…"? → binary search.** Not just finding values in arrays — searching any *answer space* where the condition flips once from false to true.

## Spot it
- Sorted array (obvious). Rotated sorted array (classic twist).
- "Minimum speed/capacity/days to…" — the answer space is monotonic: too slow fails, fast enough always works. **Binary search the answer.**

## The move
```js
let lo = 0, hi = n - 1;
while (lo <= hi) {
  const mid = (lo + hi) >> 1;
  if (arr[mid] === target) return mid;
  if (arr[mid] < target) lo = mid + 1;
  else hi = mid - 1;
}
return -1;
```
```js
// Search-the-answer skeleton (memorize this shape)
let lo = MIN_POSSIBLE, hi = MAX_POSSIBLE;
while (lo < hi) {
  const mid = (lo + hi) >> 1;
  if (works(mid)) hi = mid;      // mid is enough — try smaller
  else lo = mid + 1;             // not enough — must go bigger
}
return lo;                        // smallest value that works
```
The two skeletons differ on purpose: `<=` with early return finds *a* match; `<` converging finds the *boundary*. Knowing which you need kills the off-by-one forever.

**Complexity:** O(log n) — say "halving the space each step".

## Say this in the interview
"The predicate is monotonic — once a speed works, every faster speed works — so I'll binary-search the smallest passing value: O(n log(range)) instead of trying every candidate."

## Now grind ⬇
Classic search → leftmost-true boundary → rotated array (decide which half is sorted) → Koko's bananas (search the answer — the pattern's final form).
