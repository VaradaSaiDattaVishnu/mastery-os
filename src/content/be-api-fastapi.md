FastAPI combines Python's async capabilities with Pydantic's type-driven validation to produce a self-documenting, high-throughput service that is the natural home for ML inference workloads.

## The core

FastAPI is built on **Starlette** (ASGI framework) and **Pydantic** (data validation). When you annotate route parameters and request bodies with Pydantic models, FastAPI automatically:
- Validates and coerces incoming JSON
- Generates an OpenAPI spec (served at `/docs`)
- Produces typed Python objects in the handler

**ASGI vs WSGI:** Traditional Flask/Django are WSGI — synchronous, one thread per request. FastAPI is ASGI — a single process handles many concurrent requests via the event loop. `async def` handlers don't block; `def` (sync) handlers are automatically run in a thread pool via `asyncio.run_in_executor` so they don't block the loop either.

**Uvicorn** is the ASGI server; **Gunicorn + uvicorn workers** is the production pattern for multi-core utilisation.

```python
# ml_service/main.py — Isolation Forest fraud scoring service
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field, field_validator
from contextlib import asynccontextmanager
from typing import Annotated
import numpy as np
from sklearn.ensemble import IsolationForest
import joblib, os

# --- Lifespan: load model once at startup, clean up at shutdown ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = joblib.load(os.environ["MODEL_PATH"])
    yield
    # cleanup (close DB connections, flush buffers, etc.)

app = FastAPI(title="ML Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# --- Pydantic schemas ---
class TransactionFeatures(BaseModel):
    amount: float = Field(..., gt=0, le=1_000_000)
    hour_of_day: int = Field(..., ge=0, le=23)
    items_count: int = Field(..., ge=1)
    user_avg_spend: float = Field(..., ge=0)

    @field_validator("amount")
    @classmethod
    def round_amount(cls, v: float) -> float:
        return round(v, 2)

class ScoreResponse(BaseModel):
    anomaly_score: float          # higher = more anomalous
    is_anomaly: bool
    sigma_above_mean: float | None = None

# --- Dependency: get model from app state ---
def get_model(request) -> IsolationForest:
    return request.app.state.model

# --- Route ---
@app.post("/score", response_model=ScoreResponse)
async def score_transaction(
    features: TransactionFeatures,
    model: Annotated[IsolationForest, Depends(get_model)],
) -> ScoreResponse:
    X = np.array([[
        features.amount,
        features.hour_of_day,
        features.items_count,
        features.user_avg_spend,
    ]])
    # decision_function: negative = anomaly, positive = normal
    raw_score = float(model.decision_function(X)[0])
    is_anomaly = model.predict(X)[0] == -1

    return ScoreResponse(
        anomaly_score=-raw_score,   # flip so higher = worse
        is_anomaly=bool(is_anomaly),
    )

@app.get("/health")
async def health():
    return {"status": "ok"}
```

```bash
# Production launch: Gunicorn manages worker processes; each worker is Uvicorn
gunicorn ml_service.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 30 \
  --graceful-timeout 10
```

## In your project

The Order Processing System's `ml-service` runs Isolation Forest to score transactions for fraud. The service is called synchronously from the order saga — if it's slow, the entire order creation path is slow. The `lifespan` pattern loads the serialised model once at startup (not per-request), reducing per-call overhead from ~2s (joblib.load) to ~5ms (pure inference). Pydantic rejects negative amounts or impossible hours before the model ever runs.

## Tradeoffs & pitfalls

- CPU-bound inference (numpy/scikit-learn) holds the GIL and blocks the event loop even in an `async def` handler. For heavy inference, use `loop.run_in_executor` with a `ProcessPoolExecutor`, or call the model from a `def` route (FastAPI handles thread dispatch automatically).
- Pydantic v2 (default in FastAPI 0.100+) is a complete rewrite — `@validator` → `@field_validator`, `orm_mode` → `model_config = ConfigDict(from_attributes=True)`. Don't mix v1 and v2 syntax.
- The auto-generated `/docs` endpoint is valuable in development but leaks your schema in production. Disable with `FastAPI(docs_url=None, redoc_url=None)` unless it's an internal service.
- Never import the model at module level with a global — it makes testing difficult and prevents hot reload. The `lifespan` + `app.state` pattern is the idiomatic solution.

## Top-1% insight

FastAPI's `response_model` does not just document the response — it actively filters the serialised output to only include fields declared in the model. If your ORM object has a `password_hash` field and your `response_model` doesn't, it will never appear in the response, even if you accidentally pass the full object. This is a security guarantee, not just documentation. Pair this with `response_model_exclude_unset=True` to avoid sending `null` for optional fields the client didn't ask for — it shrinks payload size and makes API behaviour more explicit.
