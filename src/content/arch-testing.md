Test behaviour, not implementation: a test that breaks when you rename a private method is testing the wrong thing. The testing pyramid gives you a fast, stable suite that gives real confidence — not one that slows you down.

## The core

**The testing pyramid** has three layers:

1. **Unit tests** — a single module in isolation, all I/O mocked. Milliseconds per test. Should be the vast majority of your suite. Tests *what* a unit does given inputs, not *how* it does it internally.
2. **Integration tests** — two or more real modules wired together. DB in a test container, real HTTP calls to your own service. Tests that the seams between modules hold.
3. **E2E / contract tests** — the full stack or a published contract (e.g., a Pact consumer contract). Expensive. Run less frequently. Catches what the other layers can't.

**What to mock.** Mock the boundary, not the implementation. If `OrderService` calls `PaymentGateway`, mock `PaymentGateway` — it's an I/O boundary. Do not mock `OrderCalculator` just because it lives in a different file; that's internal coupling in test code.

**Test doubles taxonomy.** A *stub* returns canned data. A *spy* records calls. A *mock* verifies calls were made. A *fake* is a real implementation built for tests (e.g., an in-memory database). Fakes give the most confidence for the least friction — prefer them over mocks when the interface is stable.

```ts
// Order Processing: unit-testing the saga orchestrator with a fake payment client
interface PaymentPort {
  charge(orderId: string, amount: number): Promise<{ success: boolean; txId?: string }>
}

class InMemoryPaymentFake implements PaymentPort {
  calls: Array<{ orderId: string; amount: number }> = []
  private shouldFail = false

  simulateFailure() { this.shouldFail = true }

  async charge(orderId: string, amount: number) {
    this.calls.push({ orderId, amount })
    if (this.shouldFail) return { success: false }
    return { success: true, txId: `fake-tx-${orderId}` }
  }
}

describe('OrderSaga', () => {
  it('compensates inventory when payment fails', async () => {
    const payment = new InMemoryPaymentFake()
    const inventory = new InMemoryInventoryFake()
    payment.simulateFailure()

    // Reserve stock first (saga step 1)
    await inventory.reserve('sku-42', 2)
    expect(inventory.reserved('sku-42')).toBe(2)

    const saga = new OrderSaga({ payment, inventory })
    const result = await saga.run({ orderId: 'o-1', sku: 'sku-42', qty: 2, amount: 99 })

    expect(result.status).toBe('failed')
    // Compensation: reserved stock must be released
    expect(inventory.reserved('sku-42')).toBe(0)
    expect(payment.calls).toHaveLength(1)
  })
})
```

```ts
// Integration test: real Express + real Mongo (testcontainers)
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import { buildApp } from '../src/app'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongod.getUri()
})

afterAll(async () => { await mongod.stop() })

it('POST /orders returns 201 and persists the order', async () => {
  const app = await buildApp()
  const res = await request(app)
    .post('/orders')
    .send({ sku: 'sku-42', qty: 1, userId: 'u-1' })

  expect(res.status).toBe(201)
  expect(res.body.orderId).toBeDefined()
})
```

## In your project

Order Processing has tests across nine services. Unit tests cover the saga logic (compensations, idempotency) using fakes — no network, no Docker. Integration tests spin up `mongodb-memory-server` and test the real Mongoose models + Express routes. A dedicated `docker-compose.test.yml` runs the full service mesh for the handful of tests that need real RabbitMQ message flow.

## Tradeoffs & pitfalls

**Over-mocking.** Mocking every collaborator makes tests green on paper but meaningless in practice — you're just testing that your mock works. The classic sign: refactoring without changing behaviour causes test failures because the implementation path changed, not the outcome.

**Testing implementation details.** If you assert `expect(spy.calledWith('internal_method'))`, the test breaks on rename. Assert on observable outcomes: return values, state in the fake, HTTP response bodies.

**Slow integration tests blocking CI.** If integration tests take 4 minutes, developers skip the local run and break CI. Use `mongodb-memory-server` instead of a real Mongo. Keep the "real infrastructure" tests in a separate jest project run only on CI.

**Missing negative paths.** Most suites test the happy path thoroughly and leave error paths untested. Errors, timeouts, and partial failures are exactly what production will find — test them with fakes that simulate failure.

## Top-1% insight

The distinction between a *mock* and a *fake* is not cosmetic — it encodes a philosophy. Mocks verify interactions (how); fakes verify outcomes (what). At scale, mock-heavy suites become a straitjacket: every internal refactor requires updating a wall of `expect(mock.method).toHaveBeenCalledWith(...)` assertions. Teams that reach top-1% test quality build a library of fakes for their ports/interfaces and almost never use `jest.mock()` on internal modules — they reserve it strictly for third-party I/O boundaries (HTTP clients, SDKs).
