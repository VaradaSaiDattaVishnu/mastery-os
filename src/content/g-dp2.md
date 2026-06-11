**Two sequences or a grid → 2-D DP: `dp[i][j]` answers the problem for prefix i of one thing vs prefix j of the other.** Edit distance, LCS, unique paths — one table, three classic fillings.

## Spot it
- "Compare two strings" (edit distance, LCS, interleaving) → `dp[i][j]` over prefixes.
- "Paths in a grid with rules" → `dp[r][c]` from top/left.
- The tell: TWO independent indices that each only move forward.

## The move
```js
// LCS: dp[i][j] = LCS length of a[0..i) and b[0..j)
const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
for (let i = 1; i <= m; i++)
  for (let j = 1; j <= n; j++)
    dp[i][j] = a[i-1] === b[j-1]
      ? dp[i-1][j-1] + 1                  // match: extend the diagonal
      : Math.max(dp[i-1][j], dp[i][j-1]); // skip one or the other
return dp[m][n];
```
```js
// Edit distance: same table, transition adds replace/insert/delete
dp[i][j] = a[i-1] === b[j-1]
  ? dp[i-1][j-1]
  : 1 + Math.min(dp[i-1][j-1],            // replace
                 dp[i-1][j],              // delete from a
                 dp[i][j-1]);             // insert into a
```
The row/column 0 base cases ("empty string vs prefix") are where the bugs live — fill them deliberately: LCS base 0; edit-distance base `i` and `j` (deleting/inserting everything).

**Complexity:** O(m·n) time and space; mention you can keep only two rows → O(min(m,n)) space.

## Say this in the interview
"Two prefixes → a 2-D table. dp[i][j] = ⟨meaning over prefixes⟩; on a character match I extend the diagonal, else I take the best of the one-step reductions. O(mn), and I can roll it to two rows."

## Now grind ⬇
Unique paths (grid warm-up — counting flows down-right) → LCS (the canonical table) → edit distance (FAANG's favorite "hard-but-fair").
