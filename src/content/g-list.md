**Linked lists are pointer surgery — two patterns cover nearly everything: previous/current rewiring, and fast & slow runners.** Nodes here are plain objects: `{ val, next }`.

## Spot it
- "Reverse", "merge", "remove nth from end", "find middle", "detect cycle".
- Anything where you'd want to "look backwards" (you can't — so you carry `prev` with you).

## The move
```js
// Reversal: the three-pointer shuffle (draw it once, own it forever)
let prev = null, curr = head;
while (curr) {
  const next = curr.next;   // save the rope before cutting
  curr.next = prev;         // flip the arrow
  prev = curr; curr = next; // walk forward
}
return prev;                // new head
```
```js
// Fast & slow: middle, cycle, nth-from-end
let slow = head, fast = head;
while (fast && fast.next) {
  slow = slow.next;
  fast = fast.next.next;    // meets slow IFF there's a cycle
}
```
Why cycle detection works: in a loop, fast gains on slow by exactly 1 node per step — it cannot skip over it. That one sentence is the interview answer.

**Complexity:** O(n) time, O(1) space — the whole point vs copying to an array.

## Say this in the interview
"I'll do it in place with O(1) extra space. For reversal I carry prev/curr and flip one arrow per step; I'll narrate the pointer order because the bug is always 'cut the rope before saving it'."

## Now grind ⬇
Reverse → middle (runners) → merge two sorted (the zipper) → cycle detection. Build them with object literals; the tests construct and decode the chains for you.
