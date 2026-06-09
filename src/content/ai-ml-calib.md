An uncalibrated score is a relative ranking, not a probability — calibration makes it meaningful; ablation makes it actionable by telling the operator exactly why the model flagged something.

## The core

**Calibration.** A model is well-calibrated if "score = 0.8" means the event actually occurs 80% of the time. Isolation Forest scores are not calibrated by default — they're path-length ratios with no probabilistic interpretation. To calibrate, you need labelled holdout data (even a small set of known frauds/normals). Fit a Platt scaling sigmoid or isotonic regression on top of raw scores:

```
P(anomaly | raw_score) = sigmoid(a * raw_score + b)
```

This maps raw scores to [0, 1] probabilities that are empirically grounded. Without this, a "score of 0.7" means nothing actionable to a fraud analyst.

**Feature ablation for explainability.** To produce "amount is 24σ above this user's normal," run the model twice — once with the real feature value and once with the feature replaced by its population mean (baseline/neutral value) — and measure the score delta. The feature with the largest score delta is the primary driver. This is a simplified SHAP computation: SHAP marginal contribution = E[f(x)] - E[f(x | x_i = baseline)].

```python
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import calibration_curve
import joblib

# --- Calibration with Platt scaling ---
def calibrate_model(
    raw_scores: np.ndarray,   # IF score_samples output for holdout set
    labels: np.ndarray,       # 1 = anomaly, 0 = normal (real labels)
) -> LogisticRegression:
    """
    Fit a sigmoid (logistic regression) on top of raw scores.
    raw_scores should be negated so higher = more anomalous.
    """
    X_cal = (-raw_scores).reshape(-1, 1)  # negate: higher means more anomalous
    calibrator = LogisticRegression()
    calibrator.fit(X_cal, labels)
    return calibrator

def calibrated_score(raw_score: float, calibrator: LogisticRegression) -> float:
    """Return P(anomaly) in [0, 1]."""
    X = np.array([[-raw_score]])  # negate
    return float(calibrator.predict_proba(X)[0, 1])

# --- Feature ablation for "why" explanation ---
def explain_prediction(
    transaction_features: np.ndarray,
    feature_names: list[str],
    scaler,
    model,
) -> list[dict]:
    """
    For each feature, compute score delta when that feature is replaced by 0 (mean after scaling).
    Returns features sorted by importance descending.
    """
    baseline = np.zeros_like(transaction_features)  # 0 = mean in scaled space
    X_scaled = scaler.transform(transaction_features)
    base_score = model.score_samples(X_scaled)[0]

    contributions = []
    for i, name in enumerate(feature_names):
        ablated = X_scaled.copy()
        ablated[0, i] = 0.0  # replace feature i with its mean
        ablated_score = model.score_samples(ablated)[0]
        delta = base_score - ablated_score  # negative delta = feature pushes toward anomaly
        contributions.append({"feature": name, "delta": round(float(delta), 4)})

    contributions.sort(key=lambda x: x["delta"])  # most anomaly-contributing first
    return contributions

# Example usage
feature_names = ["amount_zscore", "velocity_7d", "hour_of_day"]
artifact = joblib.load("anomaly_detector.pkl")
transaction = np.array([[24.0, 15.0, 3.0]])   # 24σ amount, high velocity, 3am

contribs = explain_prediction(transaction, feature_names, artifact["scaler"], artifact["model"])
raw = artifact["model"].score_samples(artifact["scaler"].transform(transaction))[0]

# Produce human-readable explanation
print(f"Anomaly score: {-raw:.2f}")
for c in contribs:
    sigma = transaction[0][feature_names.index(c["feature"])]
    print(f"  {c['feature']}: {sigma:.1f}σ above normal (contribution: {c['delta']:.4f})")
# Anomaly score: 0.97
#   amount_zscore: 24.0σ above normal (contribution: -0.43)   <-- primary driver
#   velocity_7d: 15.0σ above normal (contribution: -0.31)
#   hour_of_day: 3.0σ above normal (contribution: -0.12)
```

## In your project

The Order Processing System produces human-readable explanations: "this transaction was flagged because the amount is 24σ above this user's historical mean." That output is the ablation loop above, translated to natural language using the actual zscore values stored alongside the features.

## Tradeoffs & pitfalls

- **Calibration requires labels.** If you have zero labelled anomalies (no confirmed frauds), you cannot calibrate. Use active learning: flag top-1% for human review and use their labels to calibrate iteratively.
- **Isotonic vs Platt scaling.** Platt (logistic) works well with small holdout sets but underfits complex calibration curves. Isotonic regression is more flexible but needs 1000+ calibration samples to be stable.
- **SHAP vs ablation.** True SHAP values require computing over all feature subsets (exponential) and approximated via sampling (TreeSHAP for tree models). Feature ablation with zero-replacement is fast and interpretable but ignores feature correlations.
- **Explanation drift.** If the feature distribution shifts (see: train/serve skew lesson), ablation explanations will reference outdated baselines. The "24σ above normal" claim requires the user's historical mean to be correctly and freshly computed.

## Top-1% insight

Calibration curves should be part of your model monitoring dashboard, not just model evaluation. In production, measure calibration monthly by comparing flagged-and-confirmed-fraud rates to your predicted probabilities. A well-calibrated model's calibration curve stays close to the diagonal over time. Drift in the calibration curve — where "score=0.8" now corresponds to only 50% actual fraud — is an early warning of distribution shift before your accuracy metrics even notice.
