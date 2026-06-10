Isolation Forest does not learn what fraud looks like — it learns what normal looks like, and flags whatever is hard to describe as normal. That shift from supervised classification to unsupervised isolation is why it works without a single labeled example.

## The core

An `IsolationForest` builds an ensemble of random trees. At each node it picks a random feature and a random split value between that feature's min and max. An anomalous point is isolated quickly (short path from root to leaf) because it occupies a sparse region; a normal point requires many splits to isolate because it sits in a dense cluster. The average path length across all trees, normalized by the expected path length for a random point, becomes the raw anomaly score.

The original `score_samples` output is in `(-inf, 0]`: more negative means more anomalous. The ml-service calibrates this to a clean `[0, 1]` scale using a `MinMaxScaler` fitted on the training set's score distribution, then re-centers so that `0.5` falls exactly at the model's own decision boundary (the `contamination` threshold). This is not cosmetic — it makes the score semantically meaningful: every order above `0.5` is what the model considers anomalous for that `contamination` setting.

The model is fitted once on a snapshot of real order history from MongoDB, then serialized with `joblib`. The FastAPI endpoint deserializes it at startup and holds it in memory for the lifetime of the process. When orders are too few, the cold-start bootstrap (from `features.py`) provides a realistic fallback without crashing the endpoint.

```python
# ml-service/src/model.py
from __future__ import annotations
import joblib
import numpy as np
from pathlib import Path
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import MinMaxScaler
from typing import Tuple

MODEL_PATH = Path("artifacts/iforest.joblib")
SCALER_PATH = Path("artifacts/score_scaler.joblib")

# contamination = expected fraction of anomalies in training data.
# 0.05 means "I expect about 5% of historical orders to be unusual."
# Do NOT tune this on a whim — it shifts the decision boundary.
CONTAMINATION = 0.05


def train(X: np.ndarray) -> Tuple[IsolationForest, MinMaxScaler]:
    clf = IsolationForest(
        n_estimators=200,
        contamination=CONTAMINATION,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X)

    raw_scores = clf.score_samples(X)          # shape (n,), more negative = worse
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaler.fit(raw_scores.reshape(-1, 1))

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    return clf, scaler


def load() -> Tuple[IsolationForest, MinMaxScaler]:
    return joblib.load(MODEL_PATH), joblib.load(SCALER_PATH)


def calibrate(clf: IsolationForest, scaler: MinMaxScaler, raw: float) -> float:
    """Map a single raw score_samples value to [0,1], 0.5 = decision boundary."""
    scaled = float(scaler.transform([[raw]])[0, 0])
    # Anchor 0.5 to the model's own threshold (offset = threshold after scaling)
    threshold_raw = clf.offset_
    threshold_scaled = float(scaler.transform([[threshold_raw]])[0, 0])
    # Shift so the boundary lands at exactly 0.5
    shift = 0.5 - threshold_scaled
    return float(np.clip(scaled + shift, 0.0, 1.0))


# ── FastAPI endpoint ──────────────────────────────────────────────────────────
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from features import build_user_features, FEATURE_NAMES
import numpy as np

app = FastAPI(title="ml-service", version="1.0")

_clf: IsolationForest | None = None
_scaler: MinMaxScaler | None = None


@app.on_event("startup")
def startup():
    global _clf, _scaler
    if MODEL_PATH.exists():
        _clf, _scaler = load()
    # else: cold-start mode until first training run completes


class ScoreRequest(BaseModel):
    user_id: str
    amount: float
    created_at: str          # ISO-8601
    order_history: list[dict]


class ScoreResponse(BaseModel):
    score: float             # calibrated 0–1; >0.5 = anomalous
    is_anomaly: bool
    reasons: list[str]       # top contributing features, human-readable


@app.post("/score", response_model=ScoreResponse)
def score_order(req: ScoreRequest):
    if _clf is None:
        raise HTTPException(503, "Model not yet trained")

    from datetime import datetime
    ts = datetime.fromisoformat(req.created_at)
    features = build_user_features(req.amount, ts, req.order_history)
    X = features.reshape(1, -1)

    raw = float(_clf.score_samples(X)[0])
    calibrated = calibrate(_clf, _scaler, raw)

    reasons = _ablate(features, _clf, _scaler, calibrated)

    return ScoreResponse(
        score=calibrated,
        is_anomaly=calibrated > 0.5,
        reasons=reasons,
    )


def _ablate(features, clf, scaler, baseline_score):
    """Placeholder — see ops-ml-explain for the full ablation implementation."""
    return []
```

## In your project

`ml-service` runs on port 8000 inside Docker Compose. The anomaly-service subscribes to the `order.created` RabbitMQ queue, reconstructs the feature vector (pulling order history from the order-service's MongoDB), and POSTs to `http://ml-service:8000/score`. The returned `score` and `reasons` array are patched onto the order document and streamed to the dashboard via a WebSocket event.

Before this service existed, the "ML" layer was a TensorFlow.js network trained on random synthetic data whose input ranges were hand-coded to reproduce `amount > 10000` and `orders_per_hour > 5`. It was rules wearing an ML costume. It could not detect a user whose normal spend was $50,000 placing a $200 order with unusual velocity, because the threshold was global. Isolation Forest has no global thresholds — it learns the shape of each user's normal.

## Tradeoffs & pitfalls

**`contamination` is a prior, not a finding.** Setting it to `0.1` tells the model to treat the bottom 10% of training scores as anomalous during `predict`. If your actual fraud rate is 0.5%, you will over-flag aggressively.

**Scaling matters only for the calibration step.** IsolationForest itself is scale-invariant (random splits are relative to each feature's range). The `MinMaxScaler` is applied only to the score distribution, not to the input features.

**`max_samples` and tree depth.** The default `"auto"` draws 256 samples per tree. For small training sets (<1000 orders), drop to `max_samples=min(len(X), 256)` explicitly.

**Cold start is not the same as normal.** The bootstrap vector is centered near population averages, meaning cold-start users always score near 0.5 — intentionally ambiguous, not definitively safe.

## Top-1% insight

The contamination parameter is the one knob that most practitioners tune blindly upward when they want "more sensitivity." What actually happens is the decision boundary shifts toward the dense core of normal behavior, flagging more borderline orders. A better approach is to leave contamination fixed and instead tune the dashboard threshold used for alerting (e.g., surface everything above 0.65 to analysts, auto-block above 0.90). Separating model calibration from operational thresholds means you can tighten or loosen the alert policy without retraining.
