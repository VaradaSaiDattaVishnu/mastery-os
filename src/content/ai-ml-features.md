A model is entirely defined by its features — garbage features with a perfect algorithm still produce garbage predictions, and train/serve skew is how silently correct-looking systems fail in production.

## The core

**Feature engineering.** Raw data is almost never model-ready. For fraud detection, raw transaction amount means little; amount relative to the user's historical mean is a real signal. Features must encode domain knowledge: `amount_zscore = (amount - user_mean) / user_std`, `hour_of_day`, `days_since_last_transaction`, `velocity_7d` (transactions in last 7 days) are the kind of per-user, time-aware features that make Isolation Forest work on order data.

**Train/serve skew.** The single most common production ML failure. At training time you compute features over historical data in a Pandas DataFrame. At serving time you compute the same features for a single incoming transaction — in a FastAPI route, in real time, with only the data available at that moment. If the computation differs even slightly (different window definition, different mean calculation, data sorted differently), the feature distribution the model sees at serve time will diverge from what it was trained on. The model will silently degrade.

**Leakage.** Using information at training time that wouldn't be available at prediction time. For fraud detection: if you include whether a chargeback was filed as a feature, you've leaked the label into the features. The model will appear perfect on held-out data and fail completely in production.

```python
import pandas as pd
import numpy as np

def compute_user_stats(df: pd.DataFrame) -> pd.DataFrame:
    """Compute per-user historical stats — must be called identically at train and serve."""
    stats = (
        df.sort_values("transaction_time")  # ORDER MATTERS: sort before rolling
        .groupby("user_id")
        .apply(lambda g: g.assign(
            user_mean_amount=g["amount"].expanding().mean().shift(1),  # no lookahead
            user_std_amount=g["amount"].expanding().std().shift(1).fillna(1.0),
            velocity_7d=g["transaction_time"].expanding()
                .apply(lambda ts: ((ts.max() - ts) <= pd.Timedelta("7D")).sum() - 1)
                .shift(1),
        ))
    )
    stats["amount_zscore"] = (stats["amount"] - stats["user_mean_amount"]) / stats["user_std_amount"]
    return stats.reset_index(drop=True)

def compute_features_for_inference(
    transaction: dict,
    user_history: pd.DataFrame,  # all prior transactions for this user
) -> np.ndarray:
    """
    Serve-time feature computation — MUST match training logic exactly.
    user_history must contain only rows PRIOR to this transaction.
    """
    amounts = user_history["amount"]
    mean = amounts.mean() if len(amounts) > 0 else transaction["amount"]
    std = amounts.std() if len(amounts) > 1 else 1.0
    zscore = (transaction["amount"] - mean) / std

    now = pd.Timestamp(transaction["transaction_time"])
    velocity_7d = ((now - pd.to_datetime(user_history["transaction_time"])) <= pd.Timedelta("7D")).sum()
    hour = pd.Timestamp(transaction["transaction_time"]).hour

    return np.array([[zscore, velocity_7d, hour]])  # shape (1, n_features)
```

## In your project

The Order Processing System's anomaly detector computes per-user, time-aware features. The `compute_user_stats` and `compute_features_for_inference` functions must be extracted into a shared module imported by both the training script and the FastAPI prediction endpoint — not duplicated. Any duplication is the seed of train/serve skew.

## Tradeoffs & pitfalls

- **Expanding vs rolling windows.** `expanding().mean().shift(1)` is "all history up to but not including this row" — correct for training. At serve time, user history is "all transactions before now" — the same logic. Getting the `.shift(1)` (look-ahead prevention) wrong at training time causes leakage.
- **NaN handling.** New users have no history. `std` of one value is NaN. Imputing with 1.0 (neutral zscore) must happen identically at train and serve.
- **Feature cardinality explosion.** One-hot encoding `merchant_category` with 5,000 categories creates 5,000 sparse features. Use target encoding or embeddings for high-cardinality categoricals.

## Top-1% insight

The safest architecture for eliminating train/serve skew is a **feature store**: a service that computes and caches features at event time and serves them to both training jobs and inference endpoints from the same store. The training job reads feature snapshots keyed by `(entity_id, timestamp)`; the inference endpoint reads the latest feature snapshot. Tecton, Feast, and Redis-based custom stores all implement this pattern. Without a feature store, even disciplined shared-code approaches drift over time as teams add "quick fixes" to the serving path that never make it back to training.
