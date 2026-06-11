**See "find a pair / count things / have I seen this before?" → think hashmap.** Trading O(n) memory for O(1) lookups is the single most-used trick in interviews.

## Spot it
- "Two numbers that sum to…", "find duplicates", "group by…", "count frequency", "subarray summing to k".
- Any brute-force with a nested "have I seen X?" scan — the inner loop becomes a Map.

## The move
```js
const seen = new Map();
for (let i = 0; i < arr.length; i++) {
  const need = target - arr[i];          // what would complete me?
  if (seen.has(need)) return [seen.get(need), i];
  seen.set(arr[i], i);                   // register myself for the future
}
```
For counting: `m.set(x, (m.get(x) ?? 0) + 1)`. For "subarray sum = k": store **prefix sums** seen so far; at each step ask `prefix - k` was seen how many times.

**Complexity:** O(n) time, O(n) space — say it before they ask.

## Say this in the interview
"Brute force is O(n²) with a nested scan. I'll trade space for time: one pass with a hashmap that answers 'have I seen the complement?' in O(1) — total O(n) time, O(n) space."

## Now grind ⬇
The problems below ARE the lesson. 15-min bare-handed rule applies. Each one is a different face of the same trick — by #4 your hand should reach for the Map before your brain does.
