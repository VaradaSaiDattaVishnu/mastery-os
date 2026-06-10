A calibrated score tells you how anomalous. Feature ablation tells you why. Without the second part, the score is a verdict with no reasoning — useless to anyone who needs to decide what to do next.

## The core

**Calibration** maps the `IsolationForest`'s raw `score_samples` output (a negative float, more negative = more anomalous) to a `[0, 1]` scale where `0.5` is the model's own decision boundary. A `MinMaxScaler` is fitted on the training set's score distribution, then the transformed threshold is shifted to land at exactly `0.5`. The result is a score with a consistent semantic: anything above `0.5` is what this model, at its configured `contamination`, considers unusual — not a raw internal value you have to interpret empirically.

**Feature ablation** is a model-agnostic explanation technique. For each feature in the vector, zero it out (replace it with the population mean or a neutral value), re-score, and measure how much the score drops. Features that cause the biggest drop when ablated are the biggest drivers of the anomaly. This is not SHAP — it is simpler, faster, and perfectly sufficient for tabular data with a small feature set. The top two or three contributors are rendered as human-readable strings like "Order amount is 24σ above this user's normal" by interpolating the actual feature value and its deviation from the training distribution.

The explanation strings are generated at score time and attached to the score response, so the anomaly-service relays them verbatim to the dashboard without any post-processing.

```python
# ml-service/src/explain.py
from __future__ import annotations
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import MinMaxScaler
from features import FEATURE_NAMES

# Population baseline used for ablation (fitted from training set)
# In practice, store this alongside the model artifact.
_BASELINE: np.ndarray | None = None


def set_baseline(X_train: np.ndarray) -> None:
    global _BASELINE
    _BASELINE = X_train.mean(axis=0)


def _score_single(X: np.ndarray, clf: IsolationForest, scaler: MinMaxScaler,
                  threshold_scaled: float) -> float:
    raw = float(clf.score_samples(X.reshape(1, -1))[0])
    scaled = float(scaler.transform([[raw]])[0, 0])
    shift = 0.5 - threshold_scaled
    return float(np.clip(scaled + shift, 0.0, 1.0))


def ablate(
    features: np.ndarray,
    clf: IsolationForest,
    scaler: MinMaxScaler,
    baseline_score: float,
    threshold_scaled: float,
    top_n: int = 3,
) -> list[str]:
    """
    For each feature: replace with baseline value, re-score, measure delta.
    Larger delta => larger contribution to the anomaly score.
    Returns human-readable reason strings for the top_n contributors.
    """
    assert _BASELINE is not None, "call set_baseline() after training"
    baseline_vec = _BASELINE

    contributions: list[tuple[float, int]] = []
    for i in range(len(features)):
        ablated = features.copy()
        ablated[i] = baseline_vec[i]
        ablated_score = _score_single(ablated, clf, scaler, threshold_scaled)
        delta = baseline_score - ablated_score   # how much score drops without feature i
        contributions.append((delta, i))

    contributions.sort(reverse=True)
    reasons = []
    for delta, i in contributions[:top_n]:
        if delta < 0.02:           # contribution too small to mention
            break
        reasons.append(_reason_string(i, features[i], baseline_vec[i]))

    return reasons


def _reason_string(feature_idx: int, value: float, mean: float) -> str:
    name = FEATURE_NAMES[feature_idx]
    deviation = value - mean

    templates = {
        "amount_zscore": (
            f"Order amount is {abs(value):.1f}σ {'above' if value > 0 else 'below'} "
            f"this user's normal spending."
        ),
        "orders_last_1h": (
            f"User placed {int(value)} orders in the last hour "
            f"(typical: {mean:.1f})."
        ),
        "orders_last_24h": (
            f"User placed {int(value)} orders in the last 24 hours "
            f"(typical: {mean:.1f})."
        ),
        "amount_vs_7d_avg": (
            f"Order is {value:.1f}× the user's 7-day average amount."
        ),
        "inter_order_minutes": (
            f"Median gap between this user's orders is {value:.0f} min; "
            f"population normal is {mean:.0f} min."
        ),
        "avg_amount_7d": (
            f"User's 7-day average spend ({value:.0f}) deviates "
            f"from population ({mean:.0f}) by {deviation:+.0f}."
        ),
        "unique_products_7d": (
            f"User ordered {int(value)} distinct products this week "
            f"(typical: {mean:.1f})."
        ),
    }
    return templates.get(name, f"{name} = {value:.2f} (baseline {mean:.2f})")


# ── Wiring into the FastAPI endpoint (replaces placeholder in ops-ml-iforest) ─
def build_reasons(
    features: np.ndarray,
    clf: IsolationForest,
    scaler: MinMaxScaler,
    baseline_score: float,
) -> list[str]:
    threshold_raw = clf.offset_
    threshold_scaled = float(scaler.transform([[threshold_raw]])[0, 0])
    return ablate(features, clf, scaler, baseline_score, threshold_scaled)
```

## In your project

The `explain.py` module is called inside the `/score` endpoint immediately after `calibrate()`. The returned `reasons` list travels as a JSON array on the `ScoreResponse`, is written to MongoDB alongside the score, and is rendered on the Orders dashboard as a bulleted list under each flagged order. An operator can immediately read "Order amount is 24σ above this user's normal" and decide whether to hold, escalate, or approve the order — no ML expertise required.

The `_reason_string` templates are where engineering meets product: every string is reviewed with the people who actually act on flags. Jargon-free, specific, and actionable.

## Tradeoffs & pitfalls

**Ablation assumes feature independence.** If two features are correlated (e.g., `orders_last_1h` and `orders_last_24h`), ablating one while leaving the other at its anomalous value understates both contributions. SHAP's Shapley values handle correlated features correctly but are 10–100x slower for this feature set.

**Baseline choice matters.** Using the training mean as the ablation baseline treats "mean behavior" as neutral. A better choice for skewed distributions (e.g., order amounts) is the median or a per-user baseline — though per-user baselines require storing them per user in the artifact.

**Rendering thresholds.** A delta of 0.001 in calibrated score is noise. The `0.02` guard in `ablate()` prevents the UI from showing reasons for features that contribute trivially to a 0.51 score.

**Calibration drift.** The `MinMaxScaler` is fitted on the training distribution. After retraining on new data, the score scale can shift. Always refit both the model and the scaler together, and always reload both at startup.

## Top-1% insight

Ablation-based explanations are more trustworthy than you might expect precisely because they are simple: you can manually verify "if I replace `amount_zscore` with its mean, the score drops by 0.3" and the model will behave exactly as described. With SHAP or LIME you are explaining a local approximation of the model, not the model itself. For a decision boundary as clear as a single threshold (`score > 0.5`), the extra complexity of SHAP rarely changes which features are surfaced — it only changes the exact credit allocation, which most operators do not need at that precision.
