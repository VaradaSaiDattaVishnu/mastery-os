Features computed identically at train and serve time are not a nice-to-have — they are the contract between your model and reality. Break that contract and the model you evaluated on your laptop is not the model scoring live orders.

## The core

The ml-service builds a fixed-length numeric vector from a user's order history before every fit and before every prediction. The function `build_user_features` accepts a list of past orders and returns the same columns regardless of when it is called. At training time, you call it for each user in the MongoDB snapshot. At serve time, the anomaly-service triggers a score request, the ml-service fetches the same user's recent orders from MongoDB, calls the identical function, and feeds the result to the already-fitted `IsolationForest`.

The features are explicitly time-aware: rolling windows (e.g., orders in the last hour, spending in the last 7 days) are computed relative to the timestamp of the order being scored, not wall-clock "now." That single discipline prevents the most common form of leakage — where training accidentally uses future information that is unavailable at serve time.

Cold-start users (fewer than a configurable minimum, e.g. three prior orders) receive a synthetic bootstrap vector drawn from realistic population statistics rather than a near-empty, unusable feature vector. The bootstrap is deterministic given a user id so the score is stable across retries.

```python
from __future__ import annotations
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any

# Canonical feature names — order matters; never change indices mid-deployment
FEATURE_NAMES = [
    "amount_zscore",         # (amount - user_mean) / user_std
    "orders_last_1h",
    "orders_last_24h",
    "avg_amount_7d",
    "amount_vs_7d_avg",      # ratio: current / 7-day average
    "unique_products_7d",
    "inter_order_minutes",   # median gap between consecutive orders
]

COLD_START_VECTOR = np.array([0.0, 0.0, 1.0, 50.0, 1.0, 2.0, 1440.0])


def build_user_features(
    current_amount: float,
    current_ts: datetime,
    history: List[Dict[str, Any]],
    min_history: int = 3,
) -> np.ndarray:
    """
    Compute features from order history relative to `current_ts`.
    Identical logic runs at train time (over the full history snapshot)
    and at serve time (over the live MongoDB query result).
    """
    if len(history) < min_history:
        return COLD_START_VECTOR.copy()

    amounts = np.array([o["amount"] for o in history], dtype=float)
    timestamps = [o["created_at"] for o in history]

    user_mean = amounts.mean()
    user_std = amounts.std() + 1e-9   # avoid /0
    amount_zscore = (current_amount - user_mean) / user_std

    cutoff_1h = current_ts - timedelta(hours=1)
    cutoff_24h = current_ts - timedelta(hours=24)
    cutoff_7d = current_ts - timedelta(days=7)

    recent_1h = [o for o in history if o["created_at"] >= cutoff_1h]
    recent_24h = [o for o in history if o["created_at"] >= cutoff_24h]
    recent_7d = [o for o in history if o["created_at"] >= cutoff_7d]

    avg_7d = (np.mean([o["amount"] for o in recent_7d])
              if recent_7d else user_mean)
    amount_vs_7d = current_amount / (avg_7d + 1e-9)

    unique_products = len({o.get("product_id") for o in recent_7d})

    sorted_ts = sorted(timestamps)
    if len(sorted_ts) >= 2:
        gaps = [(sorted_ts[i+1] - sorted_ts[i]).total_seconds() / 60
                for i in range(len(sorted_ts) - 1)]
        inter = float(np.median(gaps))
    else:
        inter = 1440.0

    return np.array([
        amount_zscore,
        float(len(recent_1h)),
        float(len(recent_24h)),
        avg_7d,
        amount_vs_7d,
        float(unique_products),
        inter,
    ])
```

## In your project

`build_user_features` lives in `ml-service/src/features.py` and is imported by both the training script and the FastAPI `/score` endpoint. The anomaly-service publishes `order.created` to RabbitMQ; the consumer fetches order history from MongoDB, calls `build_user_features`, and POSTs the vector to `ml-service:8000/score`. The score and contributing reasons are written back to the order document and surface on the Orders dashboard in real time.

## Tradeoffs & pitfalls

**Train/serve skew** is the silent killer: if the training script queries MongoDB with `{"created_at": {"$lte": cutoff}}` but the serve path queries without a time bound, the features have different semantics for recent users. Enforce the same query shape in both paths.

**Leakage via the current order itself**: never include the order being scored in its own feature history window. The serve path excludes it naturally (the order just arrived); the training path must explicitly exclude it by id.

**Std of one**: a user with a single prior order has a std of 0. The `1e-9` epsilon prevents `NaN` but means `amount_zscore` is enormous for that user — which is correct behavior since any second order is maximally surprising.

**Cold-start realism**: the bootstrap vector should reflect actual population statistics, not zeros. A zero vector is not "neutral" to the model — it may be deep inside or outside the normal region depending on how the forest was trained.

## Top-1% insight

The features most dangerous to get wrong are the ones involving time windows. A model trained on `orders_last_1h` computed at noon will encode Monday-noon behavior as "normal." When it scores a 3am order, the window is naturally sparse — the model will flag it as anomalous partly because of the time of day, not because anything is wrong. If your domain warrants it, add a `hour_of_day` feature explicitly so the model can learn that 3am is just quieter, not suspicious. Transparency beats accidental time-of-day discrimination.
