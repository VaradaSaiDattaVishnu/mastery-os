A model trained once and never updated is a snapshot of the past. As real orders accumulate, user behavior evolves, seasonal patterns shift, and fraud techniques change. Self-updating models stay current; static ones quietly rot.

## The core

The ml-service implements two mechanisms that together close the retraining loop.

**Scheduled retraining** runs on a configurable interval (e.g., every 24 hours via APScheduler or a Docker-scheduled cron). The trainer queries MongoDB for all completed orders up to the current timestamp, builds the feature matrix using the same `build_user_features` function used at serve time, fits a fresh `IsolationForest`, calibrates a new `MinMaxScaler` on the new score distribution, and serializes both artifacts to disk with `joblib`. Critically, the artifacts are written to a staging path and atomically renamed — a hot-swap that ensures the serving endpoint never reads a partially-written file.

**Model persistence and reload** means that a container restart does not require retraining. The `startup` event handler in FastAPI checks for the artifact files and loads them. If they are missing (first boot, fresh deployment), the service enters a graceful degraded state: the `/score` endpoint returns a `503` with a clear message rather than a silent default score. The first scheduled training run promotes the service to fully operational.

The training loop also recomputes the population baseline used by the ablation module (`set_baseline(X_train)`) and persists it alongside the model so explanations stay consistent with the current artifact.

```python
# ml-service/src/train.py
from __future__ import annotations
import numpy as np
import joblib
import logging
from datetime import datetime, timezone
from pathlib import Path
from pymongo import MongoClient
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import MinMaxScaler
from features import build_user_features, COLD_START_VECTOR, FEATURE_NAMES
from explain import set_baseline

log = logging.getLogger(__name__)

ARTIFACT_DIR = Path("artifacts")
MODEL_PATH = ARTIFACT_DIR / "iforest.joblib"
SCALER_PATH = ARTIFACT_DIR / "score_scaler.joblib"
BASELINE_PATH = ARTIFACT_DIR / "feature_baseline.npy"
CONTAMINATION = 0.05
MIN_ORDERS_TO_TRAIN = 50   # don't train on a handful of rows


def build_training_matrix(mongo_uri: str, db_name: str) -> np.ndarray:
    client = MongoClient(mongo_uri)
    db = client[db_name]

    # Group orders by user to compute per-user features
    pipeline = [
        {"$sort": {"created_at": 1}},
        {"$group": {"_id": "$user_id", "orders": {"$push": "$$ROOT"}}},
    ]
    rows = []
    for user_doc in db.orders.aggregate(pipeline, allowDiskUse=True):
        orders = user_doc["orders"]
        for i, order in enumerate(orders):
            history = orders[:i]    # strictly prior orders — no leakage
            vec = build_user_features(
                current_amount=order["amount"],
                current_ts=order["created_at"],
                history=history,
            )
            rows.append(vec)

    client.close()
    return np.array(rows)


def retrain(mongo_uri: str, db_name: str) -> bool:
    """
    Build a fresh model from current order history.
    Returns True if successful, False if insufficient data.
    Atomic artifact swap: never leaves a partial write on disk.
    """
    log.info("Retraining started at %s", datetime.now(timezone.utc).isoformat())
    X = build_training_matrix(mongo_uri, db_name)

    if len(X) < MIN_ORDERS_TO_TRAIN:
        log.warning("Only %d training rows — skipping retrain", len(X))
        return False

    clf = IsolationForest(
        n_estimators=200,
        contamination=CONTAMINATION,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X)

    raw_scores = clf.score_samples(X)
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaler.fit(raw_scores.reshape(-1, 1))

    feature_baseline = X.mean(axis=0)

    # Write to staging paths, then atomic rename
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    staging_model = ARTIFACT_DIR / "_iforest.tmp"
    staging_scaler = ARTIFACT_DIR / "_scaler.tmp"
    staging_baseline = ARTIFACT_DIR / "_baseline.tmp"

    joblib.dump(clf, staging_model)
    joblib.dump(scaler, staging_scaler)
    np.save(staging_baseline, feature_baseline)

    staging_model.rename(MODEL_PATH)
    staging_scaler.rename(SCALER_PATH)
    staging_baseline.rename(BASELINE_PATH)

    log.info("Retrain complete. %d samples, artifact written.", len(X))
    return True


# ── APScheduler wiring (called from FastAPI startup) ─────────────────────────
from apscheduler.schedulers.background import BackgroundScheduler
import os

def start_scheduler(app_state: dict) -> BackgroundScheduler:
    """
    Schedule retraining every RETRAIN_INTERVAL_HOURS (default 24).
    After each successful retrain, hot-reload the model into app_state.
    """
    interval_hours = int(os.getenv("RETRAIN_INTERVAL_HOURS", "24"))
    mongo_uri = os.environ["MONGO_URI"]
    db_name = os.environ["MONGO_DB"]

    def job():
        success = retrain(mongo_uri, db_name)
        if success:
            from model import load
            from explain import set_baseline
            clf, scaler = load()
            baseline = np.load(BASELINE_PATH)
            set_baseline(baseline.reshape(1, -1))  # update ablation baseline
            app_state["clf"] = clf
            app_state["scaler"] = scaler
            log.info("Hot-reloaded model artifacts after retrain.")

    scheduler = BackgroundScheduler()
    scheduler.add_job(job, "interval", hours=interval_hours, id="retrain")
    scheduler.start()
    return scheduler
```

## In your project

`train.py` runs at startup (first boot, if no artifacts exist) and on a 24-hour schedule via APScheduler, which is started inside `@app.on_event("startup")`. The `app_state` dict is the FastAPI application's state object (`app.state`), so the hot-reload is process-safe within a single worker. For multi-worker deployments (gunicorn + uvicorn workers), the artifacts on disk become the shared state — each worker reloads on its next request after a file-system change, which is acceptable given the 24-hour retraining cadence.

The MongoDB aggregation pipeline mirrors the one the order-service uses for history queries, ensuring the training data has the same shape as the serve-time input.

## Tradeoffs & pitfalls

**Drift vs. adaptation.** Retraining adapts the model to new patterns, but it also erases memory of rare historical fraud. If a specific fraud pattern appeared in Q1 data but not Q2, retraining on Q2 alone will forget it. Consider a sliding window (e.g., last 90 days) rather than all-time history.

**Training data quality.** Retraining on orders that include known-fraudulent ones without removing them teaches the model that fraud is normal. If you have a feedback loop (operators marking orders as confirmed fraud), exclude those documents from training.

**Artifact consistency.** The model and scaler must always be from the same training run. A mismatch (e.g., a crash between the two renames) produces silent, wrong calibrations. The staging-then-rename pattern handles this, but add a version timestamp to each artifact so you can detect mismatches at load time.

**Scheduler reliability.** APScheduler runs in-process. If the container restarts mid-interval, the next training run is delayed until the interval elapses from restart. For production, prefer an external trigger (a cron job that POSTs to `/admin/retrain`) so the schedule is decoupled from process uptime.

## Top-1% insight

The single most valuable addition to this retraining pipeline is a **shadow score comparison**: after retraining, score the last N days of orders with both the old and new model before hot-swapping. If the fraction of anomalies changes by more than some threshold (e.g., 3x), the new model has learned something dramatically different — possibly due to a data quality issue or a distribution shift that needs human review. Promoting a new model blindly without this sanity check is how silent regressions reach production in ML systems.
