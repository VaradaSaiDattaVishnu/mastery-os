**DP is recursion that stopped repeating itself.** If the brute force recomputes the same subproblem, cache it — that's it. 1-D DP: the answer at step *i* depends on a few earlier steps.

## Spot it
- "How many ways…", "min cost to reach…", "max you can take without…", "fewest coins…"
- Choices at each step + overlapping subproblems. If you can write `f(n)` in terms of `f(smaller)`, it's DP.

## The move
Always derive in this order — narrate it in interviews:
1. **State:** what does `dp[i]` *mean*? (one sentence, out loud)
2. **Transition:** `dp[i]` from previous states.
3. **Base** + **answer location**.

```js
// Climb stairs: dp[i] = ways to reach step i
// dp[i] = dp[i-1] + dp[i-2]  (last hop was 1 or 2)
let a = 1, b = 1;                        // dp[0], dp[1] — rolled to O(1) space
for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
return b;
```
```js
// Coin change: dp[a] = fewest coins to make amount a
const dp = Array(amount + 1).fill(Infinity);
dp[0] = 0;
for (let a = 1; a <= amount; a++)
  for (const c of coins)
    if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1);
return dp[amount] === Infinity ? -1 : dp[amount];
```
House robber's one-liner state: `dp[i] = max(dp[i-1], dp[i-2] + nums[i])` — skip me, or take me plus the best two ago.

**Complexity:** state count × transition cost. Coin change: O(amount × coins). Say it that way — it shows you derived, not memorized.

## Say this in the interview
"Brute force branches into repeated subproblems, so I'll define dp[i] = ⟨meaning⟩, transition ⟨formula⟩, base ⟨case⟩. That's states × transition = O(...). I can also roll the array to O(1) space since I only look back two steps."

## Now grind ⬇
Climb stairs → house robber → coin change → longest increasing subsequence (the O(n²) version — know it before the binary-search upgrade).
