Isolation Forest finds anomalies by exploiting the fact that outliers are easier to isolate with random cuts — they need fewer splits to be alone in a region than normal points surrounded by neighbours.

## The core

**The algorithm.** Build an ensemble of random "isolation trees." At each node, pick a random feature and a random split value between its min and max. Recursively partition until the point is isolated (alone in a leaf) or a depth limit is reached. The anomaly score for a point is inversely related to its average path length across all trees: a short path = isolated quickly = anomaly.

**Why it works without labels.** Normal points cluster; they take many random splits to isolate because nearby points absorb some splits. Anomalous points sit in sparse regions; a single split in a sparse area often isolates them immediately. No labels needed — sparsity is the signal.

**Anomaly score.** Scikit-learn's `IsolationForest.decision_function(X)` returns raw scores. `score_samples(X)` returns the negated average path length normalised to [-1, 0] where -1 is anomalous. The `contamination` parameter sets the threshold: `contamination=0.01` means the bottom 1% of scores are labelled anomalous. This is the key hyperparameter to tune.

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib

# --- Training ---
def train_anomaly_detector(features_df: pd.DataFrame, contamination: float = 0.01):
    feature_cols = ["amount_zscore", "velocity_7d", "hour_of_day"]
    X = features_df[feature_cols].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(
        n_estimators=200,        # more trees = more stable scores
        max_samples="auto",      # 256 by default — fast
        contamination=contamination,
        random_state=42,
    )
    model.fit(X_scaled)

    # Persist both scaler and model together — they are inseparable
    joblib.dump({"scaler": scaler, "model": model}, "anomaly_detector.pkl")
    print(f"Trained on {len(X)} samples, threshold at contamination={contamination}")
    return scaler, model

# --- Serving ---
def predict_anomaly(transaction_features: np.ndarray, artifact_path: str = "anomaly_detector.pkl") -> dict:
    artifact = joblib.load(artifact_path)
    scaler, model = artifact["scaler"], artifact["model"]

    X_scaled = scaler.transform(transaction_features)  # shape (1, n_features)

    raw_score = model.score_samples(X_scaled)[0]  # in (-1, 0), lower = more anomalous
    is_anomaly = model.predict(X_scaled)[0] == -1   # -1 = anomaly, 1 = normal

    # Normalise to [0, 1] where 1 = most anomalous
    anomaly_score = 1.0 - (raw_score + 1.0)  # maps (-1,0) -> (0,1)

    return {
        "is_anomaly": bool(is_anomaly),
        "anomaly_score": round(float(anomaly_score), 4),
        "raw_score": round(float(raw_score), 4),
    }

# Demo
np.random.seed(42)
normal_data = pd.DataFrame({
    "amount_zscore": np.random.randn(1000),
    "velocity_7d": np.random.poisson(3, 1000).astype(float),
    "hour_of_day": np.random.randint(8, 22, 1000).astype(float),
})
scaler, model = train_anomaly_detector(normal_data)

# Serve: a transaction 24σ above normal
outlier = np.array([[24.0, 15.0, 3.0]])  # extreme amount, high velocity, 3am
print(predict_anomaly(outlier))
# {'is_anomaly': True, 'anomaly_score': 0.97, 'raw_score': -0.97}
```

## In your project

The Order Processing System uses Isolation Forest to flag potentially fraudulent orders. Features are per-user and time-aware (amount zscore, 7-day velocity, hour). The `contamination=0.01` setting means 1% of training transactions are expected to be anomalous — this must match your domain estimate of actual fraud rate or your threshold will be wrong in both directions.

## Tradeoffs & pitfalls

- **Isolation Forest scales with dimensionality poorly.** Beyond ~20 features, the "random split in random dimension" becomes less informative. Feature selection matters more here than for supervised models.
- **No concept of "how anomalous" without calibration.** The raw score is not a probability. A score of -0.6 being flagged and -0.4 not being flagged is an arbitrary threshold. See the calibration lesson.
- **New users are false positives.** A new user's first transaction has no history → extreme zscore (NaN → 0 imputed, or just a weird value). Consider a "warm-up" period or separate model for cold-start users.
- **Distribution shift.** If transaction patterns change (e.g., a promotional event increases average order sizes by 5x), the trained normal distribution is wrong. Monitor score distributions over time.

## Top-1% insight

Isolation Forest's `max_samples` parameter is often overlooked. Defaulting to `min(256, n_samples)` means the trees are built on tiny subsamples — this is intentional and why the algorithm is O(n log n) and fast. But it also means each tree sees a different view of the data, and the ensemble average over 100–200 trees is what matters. Increasing `n_estimators` beyond 100 stabilises scores significantly (variance drops). The score for a borderline point can shift by 0.05–0.1 between runs with `n_estimators=50` vs `n_estimators=200` — in a production fraud system, that shift is the difference between flagging and not flagging a transaction.
