**Sorted data, or scanning from both ends → two pointers.** Two indices walking toward each other (or in tandem) replace a nested loop: O(n²) → O(n).

## Spot it
- Sorted array + "find pair/triplet with sum…"
- "Palindrome?", "container with most water", "remove duplicates in place".
- Any answer that depends on a *pair* where moving one end is provably safe.

## The move
```js
let l = 0, r = arr.length - 1;
while (l < r) {
  const sum = arr[l] + arr[r];
  if (sum === target) return [l, r];
  if (sum < target) l++;     // need more → move the small end
  else r--;                  // need less → move the big end
}
```
The interview-grade sentence is the **why it's safe**: if `sum < target`, no pair using `arr[l]` can ever work (its best partner already failed) — so discarding `l` loses nothing. That argument is the pattern.

**Complexity:** O(n) time, O(1) space (after sort, if you had to sort: O(n log n)).

## Say this in the interview
"Since it's sorted, I'll use two pointers from the ends. Each comparison safely eliminates one element — if the sum is too small, the left element can't pair with anything, because the largest candidate already failed it. One pass, constant space."

## Now grind ⬇
Four problems, ascending: palindrome → sorted pair → water container → 3Sum (two pointers inside a loop, plus dedup — the classic).
