**"Top k / kth largest / smallest while streaming" → heap.** A heap gives you the current best in O(1) and insert/remove in O(log n) — and for top-k you keep the heap at size k, NOT size n.

## Spot it
- "Kth largest", "k closest points", "k most frequent", "merge k sorted", "median of stream".
- Anti-pattern flag: full sort O(n log n) when only k items matter → heap gives O(n log k).

## The move
JavaScript has no built-in heap — FAANG knows, and "implement one" is a real question. Own these 3 operations:
```js
class MinHeap {
  constructor() { this.a = []; }
  size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(x) {
    this.a.push(x);
    let i = this.a.length - 1;                       // bubble UP
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p] <= this.a[i]) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]]; i = p;
    }
  }
  pop() {
    const top = this.a[0], last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;                                     // sift DOWN
      while (true) {
        const l = 2*i+1, r = 2*i+2; let m = i;
        if (l < this.a.length && this.a[l] < this.a[m]) m = l;
        if (r < this.a.length && this.a[r] < this.a[m]) m = r;
        if (m === i) break;
        [this.a[m], this.a[i]] = [this.a[i], this.a[m]]; i = m;
      }
    }
    return top;
  }
}
```
**Top-k trick:** kth *largest* → **min**-heap of size k (the small ones fall out, the floor of the heap is your answer). The inversion is the interview moment.

**Complexity:** top-k over n items: O(n log k) time, O(k) space.

## Say this in the interview
"Only k items matter, so I'll keep a size-k min-heap: push each element, pop when size exceeds k — whatever survives is the top k, and the root is the kth largest. O(n log k) beats sorting."

## Now grind ⬇
Build the MinHeap (the code above, from memory — yes really) → kth largest using it → k closest points (heap of [distance, point]).
