**Intervals and greedy share one opening move: SORT, then sweep once.** Sort by start to merge; sort by end to pick maximum non-overlapping. Knowing *which key* is the whole question.

## Spot it
- "Merge overlapping meetings", "minimum rooms", "remove fewest to de-overlap", "can you attend all".
- Greedy reachability: "can you jump to the end?" — track the furthest reachable frontier.

## The move
```js
// Merge: sort by START, extend or append
intervals.sort((a, b) => a[0] - b[0]);
const out = [intervals[0].slice()];
for (const [s, e] of intervals.slice(1)) {
  const last = out.at(-1);
  if (s <= last[1]) last[1] = Math.max(last[1], e);  // overlap → extend
  else out.push([s, e]);
}
```
```js
// Keep max non-overlapping: sort by END, take greedily
intervals.sort((a, b) => a[1] - b[1]);
let kept = 0, lastEnd = -Infinity;
for (const [s, e] of intervals)
  if (s >= lastEnd) { kept++; lastEnd = e; }
// removals = total - kept
```
Why end-sort is *provably* right: the interval that ends earliest leaves the most room for everything after it — swapping it for any other choice never helps. That exchange argument IS the greedy proof interviewers want to hear.
```js
// Jump game: the reachable frontier
let far = 0;
for (let i = 0; i < nums.length; i++) {
  if (i > far) return false;             // a gap we can't cross
  far = Math.max(far, i + nums[i]);
}
return true;
```
**Complexity:** O(n log n) for the sort, O(n) sweep.

## Say this in the interview
"I'll sort first — by start to merge, by end to select. Greedy works here because earliest-end dominates: exchanging it for any later-ending choice can only shrink what fits afterward. Then it's a single linear sweep."

## Now grind ⬇
Merge intervals → erase minimum to de-overlap (end-sort greedy) → jump game (frontier). Final boss of the Gauntlet — then start your re-solve ladder from the top.
