Dynamic programming applies when a problem has overlapping subproblems (the same sub-computation appears multiple times) and optimal substructure (the optimal solution is built from optimal solutions to sub-problems). Memoize or tabulate to pay for each sub-computation once.

## The core

**Two necessary conditions**:
1. **Optimal substructure**: an optimal solution to the problem contains optimal solutions to sub-problems.
2. **Overlapping subproblems**: a brute-force recursion computes the same sub-problem multiple times.

If only (1) holds, greedy works. If neither holds, you need search (BFS/DFS).

**Two implementation styles**:
- **Top-down (memoization)**: write the natural recursion; cache results. Easier to reason about; only computes needed sub-problems.
- **Bottom-up (tabulation)**: fill a table from smallest sub-problems up to the answer. No call-stack overhead; often faster due to iteration.

**State design is the hard part**: identify the minimum information needed to uniquely define a sub-problem. Common states: index into array, remaining capacity, last choice made.

```ts
// Classic: 0/1 Knapsack — maximize value given weight capacity
// State: dp[i][w] = max value using first i items with capacity w
// O(n * W) time and space; reduce to O(W) space with rolling array

function knapsack(weights: number[], values: number[], W: number): number {
  const n = weights.length
  // Rolling array: dp[w] = best value with current capacity w
  const dp = new Array(W + 1).fill(0)
  for (let i = 0; i < n; i++) {
    // Traverse right-to-left to avoid using item i twice
    for (let w = W; w >= weights[i]; w--) {
      dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i])
    }
  }
  return dp[W]
}

// Longest Common Subsequence — classic 2D DP
// State: dp[i][j] = LCS length of s1[0..i-1] and s2[0..j-1]
function lcs(s1: string, s2: string): number {
  const m = s1.length, n = s2.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i - 1] === s2[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
}

// Coin change — min coins to make amount (bottom-up)
// State: dp[a] = min coins to make amount a
function coinChange(coins: number[], amount: number): number {
  const dp = new Array(amount + 1).fill(Infinity)
  dp[0] = 0
  for (let a = 1; a <= amount; a++) {
    for (const coin of coins) {
      if (coin <= a) dp[a] = Math.min(dp[a], dp[a - coin] + 1)
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount]
}
```

**Complexity derivation**: time = number of unique states × work per state. Knapsack: O(n) items × O(W) capacities × O(1) work = O(nW). LCS: O(m × n) states × O(1) work = O(mn).

## In your project

Memoized recursion appears directly in CUBE's tree: computing aggregate statistics (visible row count, sum of values) for each node in the filter tree involves overlapping sub-computations — multiple parent nodes may query the same subtree count. Caching per-node results (the `countDescendants` memo pattern) is DP applied to a tree, called "tree DP." Invalidate only the path from the changed node to the root when the tree mutates.

More broadly, any time you find yourself thinking "I've already solved this part before" inside a recursive function, that's the signal to memoize.

## Tradeoffs & pitfalls

- **Misidentifying the state**: too coarse a state conflates distinct sub-problems (wrong answers); too fine a state creates an exponential number of states (no benefit over brute force).
- **Top-down stack overflow**: deeply nested memoized recursion can overflow. Prefer bottom-up for dp with depth proportional to input size.
- **Off-by-one in table dimensions**: `dp[n+1]` when indexing 1..n is standard; forgetting the `+1` causes out-of-bounds or overwriting the base case.
- **Unbounded vs 0/1 knapsack**: in 0/1 each item is used at most once (right-to-left inner loop); in unbounded items can repeat (left-to-right). Swapping these silently corrupts the answer.

## Top-1% insight

**DP on intervals** is a pattern many candidates miss. State `dp[i][j]` = answer for the sub-array `arr[i..j]`. The recurrence splits the interval at some index k: `dp[i][j] = max over k in [i,j) of (dp[i][k] + dp[k+1][j] + cost)`. Matrix chain multiplication, burst balloons, and palindrome partitioning all reduce to this. The traversal order must guarantee smaller intervals are computed before larger ones — iterate by *length*, not by `i`. This is a diagnostic question separating strong DP practitioners from those who only know 1D DP.
