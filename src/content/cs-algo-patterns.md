Most coding problems are instances of a small set of reusable patterns. Pattern-matching — recognizing which template fits — is faster and more reliable than deriving solutions from scratch under interview pressure.

## The core

**Two pointers**: use two indices that move through the same array (or different arrays) to avoid a nested loop. Reduces O(n²) to O(n) on sorted arrays or partitioned sequences.

**Sliding window**: a subarray/substring of variable or fixed size that "slides" right, adding the new element and removing the leftmost. Avoids recomputing the window from scratch on each step — O(n) instead of O(n²).

**Binary search**: whenever the search space has a *monotonic* property (everything left of the answer is "too small", everything right is "too large"), binary search finds the boundary in O(log n). Works far beyond sorted arrays — on answer ranges, on time, on thresholds.

```ts
// Two pointers — 3Sum (find all triplets summing to zero): O(n²) after O(n log n) sort
function threeSum(nums: number[]): number[][] {
  nums.sort((a, b) => a - b)
  const result: number[][] = []
  for (let i = 0; i < nums.length - 2; i++) {
    if (i > 0 && nums[i] === nums[i - 1]) continue  // skip duplicate
    let lo = i + 1, hi = nums.length - 1
    while (lo < hi) {
      const sum = nums[i] + nums[lo] + nums[hi]
      if (sum === 0) {
        result.push([nums[i], nums[lo], nums[hi]])
        while (lo < hi && nums[lo] === nums[lo + 1]) lo++
        while (lo < hi && nums[hi] === nums[hi - 1]) hi--
        lo++; hi--
      } else if (sum < 0) lo++
      else hi--
    }
  }
  return result
}

// Sliding window — longest substring without repeating chars: O(n)
function lengthOfLongestSubstring(s: string): number {
  const lastSeen = new Map<string, number>()
  let max = 0, left = 0
  for (let right = 0; right < s.length; right++) {
    const ch = s[right]
    if (lastSeen.has(ch) && lastSeen.get(ch)! >= left) {
      left = lastSeen.get(ch)! + 1
    }
    lastSeen.set(ch, right)
    max = Math.max(max, right - left + 1)
  }
  return max
}

// Binary search on answer space — smallest divisor such that sum ≤ threshold: O(n log max)
function smallestDivisor(nums: number[], threshold: number): number {
  const sum = (d: number) => nums.reduce((acc, n) => acc + Math.ceil(n / d), 0)
  let lo = 1, hi = Math.max(...nums)
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    sum(mid) <= threshold ? (hi = mid) : (lo = mid + 1)
  }
  return lo
}
```

**Choosing the right pattern**:
- Pair/subarray in sorted array → two pointers
- Contiguous subarray satisfying a constraint → sliding window
- "Find minimum k such that condition holds" → binary search on answer
- Nested loops that feel redundant → suspect two pointers or sliding window

## In your project

CUBE's virtualized grid uses a sliding window at the rendering layer — only the rows within `[scrollTop / rowHeight, (scrollTop + viewportHeight) / rowHeight]` are rendered. The "window" slides as the user scrolls, adding rows entering the viewport and removing rows leaving it, in O(1) per scroll event rather than O(n) re-renders.

Binary search on sorted column data powers instant "jump to row" navigation: given a sorted column, find the first row ≥ target value in O(log n) rather than a linear scan.

## Tradeoffs & pitfalls

- **Two pointers require sorted input** (for value-based problems): forgetting to sort first is the #1 mistake.
- **Sliding window off-by-one**: `right - left + 1` is the window size (inclusive both ends). Subtracting without the `+1` is the classic error.
- **Binary search loop condition**: `lo < hi` vs `lo <= hi` determines whether the answer is `lo` or `mid` at termination. Write one canonical template and stick to it — mixing them causes infinite loops or missing the boundary.
- **Integer overflow in binary search midpoint**: use `lo + ((hi - lo) >> 1)` instead of `(lo + hi) >> 1` to avoid overflow in languages without arbitrary-precision ints.

## Top-1% insight

**Binary search applies to any monotone predicate, not just sorted arrays.** The template is: define a boolean function `f(x)` that is `false` for `x < answer` and `true` for `x >= answer` (or vice versa). Binary search finds the transition point. This reframes dozens of "minimize the maximum" or "find the smallest k" problems into a mechanical template. The skill is recognizing the monotone property — once you see it, the O(log n) solution writes itself. Interviewers consistently separate candidates who pattern-match "binary search on answer" from those who brute-force or miss the search space entirely.
