pytest covers the Python ML service with unit and integration tests; TypeScript build validation catches type errors across all services; and saga integration tests verify that compensation flows actually fire when a step fails.

## The core

The testing strategy is shaped by the architecture. Three distinct layers need different testing approaches:

1. **ml-service (Python/FastAPI)** — pytest for the ML pipeline and HTTP endpoints
2. **TypeScript services** — `tsc --noEmit` as a compile-time correctness gate; Jest for unit tests
3. **Saga correctness** — integration tests that stand up real RabbitMQ and verify compensation flows

The most important tests in an event-driven system are the ones that prove the **unhappy paths** work: what actually happens when inventory is out of stock? Does the order status flip to FAILED? Is stock never double-decremented?

```python
# ml-service/tests/test_scoring.py
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.model import AnomalyDetector

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200

def test_score_normal_order():
    payload = {
        "orderId":          "test-001",
        "userId":           "user-001",
        "total":            49.99,
        "itemCount":        2,
        "hourOfDay":        14,
        "userOrderCount":   10,
        "avgOrderValue":    45.0,
        "stdOrderValue":    12.0,
    }
    response = client.post("/score", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert 0.0 <= data["anomalyScore"] <= 1.0
    assert "isAnomaly" in data

def test_score_anomalous_order():
    # A $50,000 order from a user who normally orders $50 items
    payload = {
        "orderId":        "test-anomaly",
        "userId":         "user-001",
        "total":          50000.0,
        "itemCount":      100,
        "hourOfDay":      3,          # 3 AM
        "userOrderCount": 10,
        "avgOrderValue":  50.0,
        "stdOrderValue":  10.0,
    }
    response = client.post("/score", json=payload)
    data = response.json()
    assert data["isAnomaly"] is True
    assert data["anomalyScore"] > 0.7

@pytest.fixture
def detector_with_data():
    d = AnomalyDetector()
    # Bootstrap with synthetic normal orders
    normal_orders = [
        {"total": 50 + i * 2, "itemCount": 2, "hourOfDay": 10,
         "userOrderCount": i + 1, "avgOrderValue": 50, "stdOrderValue": 5}
        for i in range(100)
    ]
    d.fit(normal_orders)
    return d

def test_detector_scores_outlier(detector_with_data):
    score = detector_with_data.score({"total": 9999, "itemCount": 50,
                                       "hourOfDay": 3, "userOrderCount": 1,
                                       "avgOrderValue": 9999, "stdOrderValue": 0})
    assert score > 0.7
```

TypeScript build validation in CI:

```yaml
# .github/workflows/ci.yml
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g pnpm && pnpm install
      - run: pnpm --filter @order-system/shared build
      - run: pnpm -r typecheck   # runs `tsc --noEmit` in every package

  test-ml:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r services/ml-service/requirements.txt
      - run: pytest services/ml-service/tests/ -v
```

A saga integration test with a real RabbitMQ (Docker-in-Docker or Testcontainers):

```ts
// tests/saga.integration.test.ts
describe('Saga compensation: out-of-stock', () => {
  it('should flip order to FAILED and not charge the customer', async () => {
    // Setup: set inventory for product-X to 0
    await InventoryModel.updateOne({ productId: 'product-X' }, { quantity: 0 })

    // Publish order.created manually (bypasses HTTP layer)
    await publishEvent(ch, 'order.created', {
      orderId: 'test-order-1',
      userId:  'user-1',
      items:   [{ productId: 'product-X', quantity: 1, price: 99 }],
      total:   99,
      timestamp: new Date().toISOString(),
    })

    // Wait for saga to settle (poll with timeout)
    const order = await waitForOrderStatus('test-order-1', 'FAILED', 5000)
    expect(order.status).toBe('FAILED')

    // Payment should never have been attempted
    const payment = await PaymentRecord.findOne({ orderId: 'test-order-1' })
    expect(payment).toBeNull()
  })
})
```

## In your project

CI runs on every push: typecheck (all TS packages), pytest (ml-service), and the integration tests if they are present. The build fails if any type diverges from `packages/shared` — this is the automated enforcement of the event contract.

## Tradeoffs & pitfalls

**Testing distributed timing**: saga tests that poll for a final state with a timeout are inherently flaky if the timeout is too short or the test environment is slow. Use generous timeouts in CI (5–10s) and reset RabbitMQ state between tests.

**Mocking vs real infra**: unit tests mock RabbitMQ and MongoDB. Integration tests use real infra (Testcontainers or a docker-compose.test.yml). Do not mock in integration tests — the entire point is to test the wiring.

## Top-1% insight

The most valuable test in a saga is not the happy path — it is the compensation test. The happy path runs in production every day. The compensation path (out-of-stock, payment failed) runs rarely, which means bugs there hide for months. Write a test for every compensation branch before you write the compensation code itself. If the test is hard to write, that is a signal the compensation logic is too coupled to the service internals.
