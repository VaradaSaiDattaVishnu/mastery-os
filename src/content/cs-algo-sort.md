Comparison-based sorting has a proven O(n log n) lower bound — you cannot do better with only comparisons. But when you know something about the data's distribution, you can break the barrier.

## The core

**The O(n log n) floor (comparison sorts)**: any algorithm that determines order *only* by comparing pairs needs at least log₂(n!) ≈ n log n comparisons in the worst case (information-theoretic argument — there are n! possible orderings; each comparison halves the remaining possibilities).

**Merge sort**: divide into halves, sort each recursively, merge. O(n log n) guaranteed, O(n) extra space, **stable**. Preferred when stability matters or data lives in linked structures.

**Quicksort**: pick a pivot, partition, recurse. O(n log n) average, O(n²) worst (sorted input + bad pivot), O(log n) space. In-place. **Not stable** by default. Faster than merge sort in practice due to cache locality and small constant. V8's `Array.prototype.sort` uses Timsort (hybrid merge/insertion sort) — stable, O(n log n).

**Heapsort**: O(n log n) guaranteed, O(1) extra space, not stable. Rarely preferred over quicksort in practice (poor cache behaviour) but good for memory-constrained environments.

**O(n) sorts — breaking the barrier**:
- **Counting sort**: when keys are integers in range [0, k]. Count occurrences, reconstruct. O(n + k) time and space. Stable.
- **Radix sort**: sort by each digit/byte from least significant to most (using counting sort per digit). O(d(n + k)) where d = digits. Beats O(n log n) when d is small.
- **Bucket sort**: distribute into b buckets, sort each bucket, concatenate. O(n + b) average when input is uniformly distributed.

```ts
// Quicksort with median-of-three pivot (avoids sorted-input worst case)
function quicksort(arr: number[], lo = 0, hi = arr.length - 1): void {
  if (lo >= hi) return
  const pivot = medianOfThree(arr, lo, hi)
  const p = partition(arr, lo, hi, pivot)
  quicksort(arr, lo, p - 1)
  quicksort(arr, p + 1, hi)
}

function partition(arr: number[], lo: number, hi: number, pivot: number): number {
  let i = lo - 1
  ;[arr[arr.indexOf(pivot)], arr[hi]] = [arr[hi], arr[arr.indexOf(pivot)]]
  for (let j = lo; j < hi; j++) {
    if (arr[j] <= arr[hi]) { i++; [arr[i], arr[j]] = [arr[j], arr[i]] }
  }
  ;[arr[i + 1], arr[hi]] = [arr[hi], arr[i + 1]]
  return i + 1
}

function medianOfThree(arr: number[], lo: number, hi: number): number {
  const mid = (lo + hi) >> 1
  const vals = [arr[lo], arr[mid], arr[hi]].sort((a, b) => a - b)
  return vals[1]
}

// Quickselect — O(n) average to find kth smallest (no full sort needed)
function quickselect(arr: number[], k: number): number {
  let lo = 0, hi = arr.length - 1
  while (lo < hi) {
    const pivot = partition(arr, lo, hi, arr[(lo + hi) >> 1])
    if (pivot === k) return arr[k]
    else if (pivot < k) lo = pivot + 1
    else hi = pivot - 1
  }
  return arr[lo]
}

// Counting sort for integer keys in [0, max]
function countingSort(arr: number[]): number[] {
  const max = Math.max(...arr)
  const count = new Array(max + 1).fill(0)
  for (const n of arr) count[n]++
  // Prefix sum for stability
  for (let i = 1; i <= max; i++) count[i] += count[i - 1]
  const out = new Array(arr.length)
  for (let i = arr.length - 1; i >= 0; i--) out[--count[arr[i]]] = arr[i]
  return out
}
```

**Stability**: a stable sort preserves the relative order of equal elements. Critical when sorting by a secondary key after a primary sort (e.g., sort by name, then by department — the name sort must be stable).

## In your project

CUBE's grid sorts 100k rows client-side. The browser's built-in `Array.sort` (Timsort) handles this well — Timsort exploits pre-existing order in real-world data ("runs"), achieving O(n) on nearly-sorted input, which is common after a single column change. Understanding this means you don't reach for a manual sort.

Quickselect is the structure behind "find the 95th-percentile row by latency without sorting everything" — O(n) average vs O(n log n) for a full sort. Useful for dashboards that show outliers.

## Tradeoffs & pitfalls

- **Stability assumption**: JavaScript's `Array.sort` is stable (ES2019+), but older engines weren't. Assume stable only in Node 11+ / modern browsers.
- **Counting sort with large range**: if max = 10⁹, you can't allocate a 10⁹-element array. Radix sort (which uses counting sort per digit) handles large integers without large arrays.
- **Quicksort worst case**: always sorted or reverse-sorted input. Randomizing the pivot (or using median-of-three) avoids it. Timsort is immune because it detects and merges existing runs.
- **Mutating the original**: `Array.sort` sorts in place. For immutable patterns, `[...arr].sort()` first.

## Top-1% insight

**Introsort — how production quicksort avoids O(n²)**: most production sort implementations (C++ `std::sort`, many others) use introsort: start with quicksort, switch to heapsort when recursion depth exceeds 2 log n (detecting the degenerate case), and switch to insertion sort for small partitions (< 16 elements, where insertion sort's cache-friendly sequential access wins). The result: O(n log n) guaranteed, O(1) extra space, fast in practice. Understanding this three-way hybrid is what separates "I know quicksort is O(n log n) average" from a senior-level answer about why it's actually used in production.
