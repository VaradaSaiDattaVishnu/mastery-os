Every unsupervised detector answers the same question — "is this point weird?" — but each defines *weird* with a different geometry. kNN says weird = far from your nearest neighbours. LOF says weird = in a thinner region than your neighbours sit in. k-means says weird = far from every cluster centre. Isolation Forest says weird = easy to cut off with random splits. Picking the right one is picking the geometry that matches how fraud actually looks in your feature space.

## The core

All four are **unsupervised**: they never see a `fraud=true` label (you almost never have one for orders). They learn the shape of *normal* and score how far an order departs from it. They differ in what "far" means and how it scales.

### 1. k-Nearest-Neighbours distance (global, distance-based)

**Idea.** Score a point by its distance to its k-th nearest neighbour (or the mean distance to its k neighbours). Outliers sit far from everyone, so that distance is large.

**Math.** For point *x*, let *N_k(x)* be its k nearest neighbours and *d(x, x_k)* the distance to the k-th. The score is just

```
score_kNN(x) = d(x, x_k)          # or  (1/k) Σ_{y∈N_k(x)} d(x, y)
```

A point is flagged if `score > τ` for a global threshold τ.

```python
from sklearn.neighbors import NearestNeighbors
import numpy as np

nn = NearestNeighbors(n_neighbors=20).fit(X_train)   # X must be scaled!
dist, _ = nn.kneighbors(X)            # (n, 20) sorted ascending
score = dist[:, -1]                   # distance to the 20th neighbour
flag  = score > np.quantile(score, 0.95)
```

**When to use it.** Low-dimensional data, one roughly-uniform density, and you want a dead-simple, explainable baseline ("this order is 8× further from normal orders than typical"). **Where it breaks:** a single *global* threshold can't serve clusters of different density — a normal point inside a sparse cluster looks as "far" as a true outlier near a dense one. And it needs the whole training set in memory at query time (lazy learner), O(n) per query without an index.

### 2. Local Outlier Factor (local, density-based)

**Idea.** Fix kNN's blind spot: judge a point against the density of *its own neighbourhood*, not a global threshold. A point is an outlier if it sits in a region noticeably *thinner* than where its neighbours sit.

**Math.** With `k-dist(x)` = distance to the k-th neighbour:

```
reach-dist_k(x, y) = max( k-dist(y), d(x, y) )          # smoothed distance
lrd_k(x) = 1 / ( mean_{y∈N_k(x)} reach-dist_k(x, y) )    # local reachability density
LOF_k(x) = mean_{y∈N_k(x)} [ lrd_k(y) / lrd_k(x) ]       # how much sparser x is than its neighbours
```

`LOF ≈ 1` → same density as neighbours (normal). `LOF ≫ 1` → x is in a much thinner region than its neighbours → local outlier. `LOF < 1` → denser than neighbours (core point).

```python
from sklearn.neighbors import LocalOutlierFactor

lof = LocalOutlierFactor(n_neighbors=20, contamination="auto")
labels = lof.fit_predict(X)              # -1 = outlier, 1 = inlier (transductive)
scores = -lof.negative_outlier_factor_   # higher = more anomalous
# For scoring *new* points, fit with novelty=True, then lof.predict(X_new)
```

**When to use it.** Clusters of genuinely different density, and the anomalies you care about are *local* — "normal globally, but weird for this little pocket." **Where it breaks:** O(n²) neighbour queries (slow on large data), very sensitive to `k`, distances degrade in high dimensions, and the default mode is transductive (can't score unseen points unless you set `novelty=True`).

### 3. k-means distance-to-centroid (clustering, repurposed)

**Idea.** k-means isn't an anomaly detector — but you can borrow it. Cluster normal data into *k* blobs, then score a point by its distance to the nearest centroid. Far from every centre = doesn't belong to any normal mode.

**Math.** k-means minimises within-cluster sum of squares (Lloyd's algorithm: assign → recompute means → repeat):

```
minimise  Σ_j Σ_{x∈C_j} ‖x − μ_j‖²
score_kmeans(x) = min_j ‖x − μ_j‖²        # distance to nearest centroid
```

```python
from sklearn.cluster import KMeans
import numpy as np

km = KMeans(n_clusters=8, n_init="auto", random_state=42).fit(X_train)  # scale X!
score = km.transform(X).min(axis=1)       # distance to nearest centroid
flag  = score > np.quantile(score, 0.99)
```

**When to use it.** You already cluster the data for another reason (segmentation), data is roughly spherical-blob shaped, and you want something O(n·k·iters)-cheap. **Where it breaks:** you must pick `k`; centroids are *pulled toward outliers* (the very things you're hunting bias the model — not robust); assumes convex, similar-size clusters; pure distance, so it needs scaling and suffers the curse of dimensionality.

### 4. Isolation Forest (ensemble, isolation-based)

**Idea.** Flip the framing entirely. Don't model density or distance — just measure *how hard a point is to isolate* with random cuts. Build many random binary trees; at each node pick a random feature and a random split between its min and max. Anomalies live in sparse regions, so a random cut lands on the empty side and isolates them in **few** splits. Normal points are buried in dense mass and need **many** splits.

**Math.** The score is built from the average path length `h(x)` (root→leaf depth) across all trees, normalised by `c(n)`, the average path length of an unsuccessful binary-search-tree lookup over *n* points:

```
c(n) = 2·H(n−1) − 2(n−1)/n        where H(i) ≈ ln(i) + 0.5772156649 (Euler–Mascheroni)
s(x, n) = 2^( − E[h(x)] / c(n) )
```

`s → 1` (short paths, isolated fast) = anomaly; `s ≈ 0.5` = normal; `s ≪ 0.5` = deeply normal. scikit-learn exposes this as `decision_function` (**positive = inlier, negative = outlier, 0 = boundary**).

```python
from sklearn.ensemble import IsolationForest

clf = IsolationForest(n_estimators=200, contamination="auto",
                      random_state=42, n_jobs=-1).fit(X_train)  # NO scaling needed
df = clf.decision_function(X)    # >0 normal, <0 anomalous, 0 = boundary
flag = df < 0
```

**When to use it.** Higher-dimensional tabular data, mixed feature scales, and you need fast, constant-time scoring of a stream. **Where it breaks:** it finds *global* anomalies and uses axis-parallel cuts, so it's weaker on *local* density anomalies (LOF's turf) and on anomalies that only show up in feature *correlations* (a diagonal blob).

### The decision table

| Detector | "Weird" means | Scales to large/stream? | Needs scaling? | Catches *local* anomalies? | Cost |
|---|---|---|---|---|---|
| kNN-distance | far from neighbours | poor (lazy, O(n)/query) | yes | no (global τ) | O(n) query |
| LOF | thinner region than neighbours | poor (O(n²)) | yes | **yes** | O(n²) |
| k-means | far from every centroid | good | yes | no | O(n·k·i) |
| **Isolation Forest** | easy to isolate | **excellent (O(t·log ψ))** | **no** | weakly | O(t·ψ·log ψ) train |

## In your project

The Order Processing System scores every order with **Isolation Forest** (`services/ml-service/app/model.py`). Three properties of the order-fraud problem picked it:

1. **No labels.** Nobody tags orders as fraud, so anything supervised (logistic regression, gradient-boosted trees, a neural net) is off the table on day one. That still leaves all four detectors here — so the next two points are the real tiebreakers.
2. **Mixed, unscaled feature geometry.** The 12-dim vector mixes `log_amount`, z-scores, a binary `is_night`, and cyclical `hour_sin/cos`. A Euclidean distance over those is meaningless without careful scaling — which kNN, LOF, and k-means *all* require. Isolation Forest splits each feature on its own range, so it's **scale-invariant** and needs no `StandardScaler`.
3. **Streaming, constant-time scoring.** Orders arrive one at a time and must be scored in milliseconds inside a 5-second budget. IF scores in O(t·log ψ) against a tiny persisted model; kNN/LOF would need the whole order history in memory at query time, and LOF can't even score unseen points without `novelty=True`.

**The training data.** The model fits on a time-aware feature matrix built from MongoDB order history (`build_training_matrix` groups by user, sorts by time, and each row uses only that user's *earlier* orders — no future leakage). When fewer than **50** real orders exist (`MIN_TRAINING_SAMPLES`), it cold-starts on `generate_synthetic_orders(800)`: ~94% ordinary orders (1–3 items, business hours, a realistic `$19.99–$999.99` catalog) and ~6% planted anomalies (12–60 units of pricey items at 0–5 AM), with any real orders folded in to anchor it. An APScheduler job retrains every **1800s**, so once real history passes the threshold the synthetic scaffold drops away. `contamination="auto"` lets sklearn place the boundary rather than us hard-coding a fraud rate.

## Tradeoffs & pitfalls

- **The "all four are unsupervised" trap.** In an interview, "Isolation Forest because it's unsupervised" is a *weak* answer — so are the other three. The strong answer is scale-invariance + streaming cost + dimensionality (points 2 and 3 above).
- **Distance methods demand scaling; IF doesn't.** If you ever A/B a kNN or LOF baseline, a missing `StandardScaler` silently makes `log_amount` dominate every distance. IF sidesteps this entirely.
- **IF is axis-parallel and global.** It can miss a fraud pattern that's only anomalous as a *correlation* (e.g. high amount **and** low item count together) or only *locally* odd. The mitigation is in the next section.
- **k as a landmine.** kNN and LOF live or die by `k`; k-means by the number of clusters. IF's `n_estimators`/`max_samples` are far more forgiving — 200 trees on 256-point subsamples is robust out of the box.

## Top-1% insight

The deepest point isn't "Isolation Forest beat LOF" — it's that **feature engineering chose the algorithm.** IF's known weakness is *local* anomalies: an order that's normal globally but bizarre for *this* user. Instead of reaching for LOF to capture that locality, the project bakes locality straight into the features — `amount_vs_user_z` (how far this order is from the user's own mean), `user_orders_1h`, `amount_vs_user_z` vs `amount_vs_global_z`. A "$200 order from someone whose normal is $50k" becomes a point with an extreme **z-score coordinate** — now *globally* far in feature space, exactly what IF isolates in one cut.

So the local/global distinction that would normally force LOF dissolves: engineer per-entity context into the vector, and a cheap global detector sees local anomalies for free. That's the move — **push structure into the features so the simplest, fastest model is sufficient** — and it's why the system can use an O(t·log ψ) detector instead of an O(n²) one and lose nothing that matters.
