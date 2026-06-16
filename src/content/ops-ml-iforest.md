Isolation Forest does not learn what fraud looks like — it learns what normal looks like, and flags whatever is hard to describe as normal. That shift from supervised classification to unsupervised isolation is why it works without a single labeled example, and it's the right call here for three concrete reasons: there are no fraud labels, the features are mixed-scale (so distance methods would need careful scaling), and orders must be scored one at a time in milliseconds.

## The core

An `IsolationForest` builds an ensemble of random trees. At each node it picks a random feature and a random split value between that feature's min and max. An anomalous point is isolated quickly (short path from root to leaf) because it sits in a sparse region; a normal point needs many splits because it's buried in dense mass. The average path length across all trees, normalised by the expected length for *n* points, is the raw anomaly signal. scikit-learn exposes it as `decision_function`: **positive = inlier, negative = outlier, exactly 0 = the contamination boundary.**

The service does **not** rescale inputs (Isolation Forest is scale-invariant — splits are relative to each feature's own range). What it *does* calibrate is the **output**. `decision_function` is unbounded and hard to read, so `AnomalyModel.calibrate` squashes it through a logistic centred on the boundary:

```
score = logistic(−df / df_scale) = 1 / (1 + e^(df / df_scale))
```

where `df_scale` is the standard deviation of `decision_function` over the training set. At `df = 0` (the model's own boundary) the score is exactly **0.5**; inliers (`df > 0`) fall below 0.5, outliers (`df < 0`) rise above it, and `df_scale` makes the slope adapt to how spread-out the forest's scores actually are. An order is flagged when the calibrated score clears `ANOMALY_THRESHOLD` (default **0.6**) — note that's a tunable *operating* threshold sitting above the 0.5 model boundary, deliberately conservative.

The whole fitted object — the forest, per-feature medians/means/stds (for explanation), `df_scale`, the global amount stats, and metadata — is serialised as **one** `models/model.joblib` state dict and reloaded on startup.

```python
# services/ml-service/app/model.py  (faithful to the real implementation)
import math
import numpy as np
from sklearn.ensemble import IsolationForest

def _logistic(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    z = math.exp(x)
    return z / (1.0 + z)            # numerically stable for x < 0

class AnomalyModel:
    def fit(self, X, *, global_mean, global_std, cold_start,
            contamination, n_estimators, random_state, threshold):
        self.iforest = IsolationForest(
            n_estimators=n_estimators,      # 200
            contamination=contamination,    # "auto" by default — sklearn places the boundary
            random_state=random_state,      # 42
            n_jobs=-1,
        )
        self.iforest.fit(X)

        # Stats kept for the ablation explanation, not for scaling inputs.
        self.medians = np.median(X, axis=0)
        self.means, self.stds = np.mean(X, axis=0), np.std(X, axis=0)

        df = self.iforest.decision_function(X)
        self.df_scale = float(np.std(df)) or 1.0      # adapts the logistic slope
        self.global_mean, self.global_std = global_mean, global_std
        self.threshold = threshold                    # 0.6

    def calibrate(self, df: float) -> float:
        """decision_function → [0,1] anomaly score (0.5 = model boundary)."""
        return _logistic(-df / self.df_scale)

    def score(self, x: np.ndarray) -> dict:
        df = float(self.iforest.decision_function(x.reshape(1, -1))[0])
        calibrated = self.calibrate(df)
        return {
            "score": round(calibrated, 4),
            "is_anomaly": bool(calibrated >= self.threshold),
            "decision_function": round(df, 4),
            "threshold": self.threshold,
        }
```

The FastAPI `/score` endpoint (`app/main.py`) deserialises this once and holds it behind a thread-safe `ModelStore`. Critically, **the caller does not send order history** — the endpoint fetches the user's prior orders itself from MongoDB and excludes the order being scored, so the serve path can't leak the present into the past:

```python
@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    model = store.model
    if model is None or model.iforest is None:
        raise HTTPException(503, "model not trained yet")

    now   = parse_timestamp(req.createdAt)
    prior = load_user_prior_orders(req.userId, before=now, exclude_order_id=req.orderId)
    x       = extract_features(req.model_dump(), prior, model.global_mean, model.global_std, now=now)
    result  = model.score(x)
    factors = model.explain(x)               # leave-one-feature-out ablation → see ops-ml-explain
    return ScoreResponse(
        score=result["score"], is_anomaly=result["is_anomaly"],
        threshold=result["threshold"], decision_function=result["decision_function"],
        model_version=model.model_version, cold_start=model.cold_start,
        top_factors=factors, reasons=[f["description"] for f in factors],
    )
```

## In your project

`ml-service` runs on port 8000 inside Docker Compose. The Node **anomaly-service** subscribes to the `order.created` topic (in parallel with the inventory service), then POSTs the raw order to `http://ml-service:8000/score` with a **5-second timeout**. The call is deliberately **fail-open**: if the ML service is down, slow, or returns a bad response, `scoreOrder` returns `null`, the consumer logs loudly and skips the flag — a scoring outage must never block the order pipeline. When the model *does* flag an order, the consumer publishes `anomaly.detected` to the notifications exchange carrying the calibrated `score`, the human-readable `reasons`, and the `topFactors`. The Node side speaks the domain (orders, events); the Python side owns all feature engineering, the model, and its training data — a clean microservice seam.

**What it trains on.** MongoDB order history is the single source of truth. `build_training_matrix` groups orders by user, sorts by time, and builds each 12-dim row from only that user's *earlier* orders — the same `extract_features` used at serve time, which is what guarantees train/serve parity. Below **50** real orders (`MIN_TRAINING_SAMPLES`) it cold-starts on `generate_synthetic_orders(800)` — a realistic stream (~94% ordinary orders on a `$19.99–$999.99` catalog during business hours, ~6% bulk-at-3 AM anomalies) with any real orders folded in — and marks the model `cold_start=True`. An APScheduler job retrains every **1800s**, so the synthetic scaffold falls away as real history accumulates.

Before this existed, the "ML" layer was a TensorFlow.js network trained on random synthetic data whose input ranges were hand-coded to reproduce `amount > 10000` and `orders_per_hour > 5`. It was rules wearing an ML costume — it couldn't detect a user whose normal spend was \$50,000 placing an unusual \$200 order, because the thresholds were global. Isolation Forest has no global thresholds; per-user features give it the shape of *each* user's normal.

## Tradeoffs & pitfalls

**`contamination` is a prior, not a finding.** It sets where `decision_function = 0` lands. The service leaves it `"auto"` so sklearn derives the boundary from the data; pinning it to `0.1` would tell the model to treat the bottom 10% of training scores as anomalous regardless of reality.

**Two thresholds, don't conflate them.** `contamination` defines the *model's* boundary (calibrated 0.5). `ANOMALY_THRESHOLD=0.6` is the *operating* threshold for alerting. Keeping them separate means you can tighten or loosen what reaches an analyst **without retraining** — raise it toward 0.9 to auto-block only the most extreme, lower it to surface more for review.

**Calibration is a logistic, not a MinMaxScaler.** A min-max rescale of scores would be brittle to a single extreme training point (it'd compress everything else). The logistic on `−df/df_scale` is bounded, centred on the real boundary, and robust because `df_scale` is a standard deviation, not a min/max.

**Cold start is not "safe."** The bootstrap is centred near population behaviour, so cold-start users score *near* the boundary — intentionally ambiguous, not definitively clean. The `cold_start` flag rides along on every response so the dashboard can say so.

## Top-1% insight

The interview-grade version of "why Isolation Forest" is **not** "because it's unsupervised" — kNN, LOF, and k-means are unsupervised too (see *Choosing a detector*). The decisive reasons are narrower: the 12-dim vector mixes `log_amount`, z-scores, a binary `is_night`, and cyclical `hour_sin/cos`, so any **distance**-based detector would need careful scaling and still suffer in higher dimensions — Isolation Forest is **scale-invariant** and splits each feature independently. And orders must be scored **one at a time, fast**: IF scores in O(t·log ψ) against a tiny persisted model, whereas kNN/LOF are lazy learners needing the whole history at query time. The unusual design choice is calibrating the *output* with a logistic while leaving the *input* unscaled — most people instinctively reach for a `StandardScaler` on the features and never calibrate the score, which is exactly backwards for this algorithm.
