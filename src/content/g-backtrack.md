**"All combinations / permutations / ways to…" → backtracking: choose, explore, un-choose.** It's DFS over decisions instead of nodes — and the un-choose line is the entire pattern.

## Spot it
- "Generate ALL…" (subsets, permutations, combinations, palindrome partitions).
- "Can you reach/spell/place…" with choices at each step (word search, N-queens).
- The output size is exponential → so the algorithm is too. Say that upfront; it's expected.

## The move
```js
function subsets(nums) {
  const res = [], path = [];
  function dfs(start) {
    res.push([...path]);                 // every node IS a subset (copy!)
    for (let i = start; i < nums.length; i++) {
      path.push(nums[i]);                // choose
      dfs(i + 1);                        // explore (start=i+1 ⇒ no reuse)
      path.pop();                        // UN-CHOOSE — the magic line
    }
  }
  dfs(0);
  return res;
}
```
The three dials every variant turns:
- **Permutations** — loop from 0 with a `used[]` array instead of `start`.
- **Combination sum (reuse allowed)** — recurse with `i`, not `i + 1`.
- **Dedup in sorted input** — `if (i > start && nums[i] === nums[i-1]) continue;`

**Complexity:** O(2ⁿ) subsets / O(n!) permutations — output-bound. Mention pruning (sort + break when over target) to show seniority.

## Say this in the interview
"This asks for all solutions, so backtracking: at each step I choose, recurse, then undo the choice so the path is clean for the next branch. The state space is 2ⁿ — unavoidable since the output is that big — but I'll prune branches that already exceed the target."

## Now grind ⬇
Subsets (the skeleton) → permutations (used[] twist) → combination sum (reuse + prune). Watch your hand learn `push → dfs → pop` as one motion.
