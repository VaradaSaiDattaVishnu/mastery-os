Express is a linked list of middleware functions; a request travels the list in order and stops when a response is sent or the list ends — `next()` is the explicit hand-off between nodes.

## The core

Every middleware has the signature `(req, res, next) => void`. Express stores them in registration order. When a request arrives, Express walks the list: if the path matches, it calls the function; the function either writes a response (terminating the chain) or calls `next()` to continue, or calls `next(err)` to skip to the nearest error handler.

**Error middleware** is identified by four arguments `(err, req, res, next)` — Express will only call it when `next(err)` is invoked. You can have multiple; the first matching one wins.

**Router** is a mini-app — a self-contained middleware stack with its own routes. Mounting a router at a path prefix scopes all its routes under that prefix.

**Request lifecycle:**
1. Body parsing (`express.json()`, `express.urlencoded()`)
2. Logging / request ID injection
3. Authentication
4. Authorization
5. Route handler (business logic)
6. Error handler

```ts
import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

const app = express();

// 1. Global middleware — runs for every request
app.use(express.json({ limit: '1mb' }));

// 2. Request ID — essential for distributed tracing
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.id = req.headers['x-request-id'] as string ?? randomUUID();
  next();
});

// 3. Scoped router
import { Router } from 'express';
const usersRouter = Router();

usersRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const user = await userService.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    res.json({ data: user });
  } catch (err) {
    next(err);   // hand off to error handler — never swallow
  }
});

app.use('/api/users', usersRouter);

// 4. Catch-all 404
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// 5. Centralised error handler — must be LAST and have exactly 4 params
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = (err as any).status ?? 500;
  res.status(status).json({ error: err.message ?? 'INTERNAL_ERROR' });
});
```

```ts
// async wrapper — avoids repeating try/catch in every route
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
}

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = await userService.create(req.body);
    res.status(201).json({ data: user });
  })
);
```

## In your project

JARVIS, Unity, and the Order gateway all use Express middleware pipelines. In the Order gateway, the pipeline is: request ID injection → JWT authentication → RBAC check → rate limiter → proxy to downstream service. This order is deliberate: the rate limiter runs after auth so limits are per-user, not per-IP (which is trivially spoofed). Re-ordering those two middlewares would break the entire security model.

## Tradeoffs & pitfalls

- `next()` without an argument moves to the next matching middleware. `next('route')` skips the rest of the current router's stack and falls through to the next router. `next(err)` skips to the error handler. Confusing these causes silent request hangs.
- An async route handler that throws without a `.catch(next)` leaves the request hanging in Node 14 and below; Node 15+ crashes the process. Always use the `asyncHandler` wrapper or Express 5's native async support.
- Body parser `limit` defaults to `100kb`. A client uploading a 10MB JSON payload will get a 413 you never explicitly coded — know the default.
- Middleware registered after `app.use('/', router)` is unreachable for routes handled by that router. Order everything intentionally.

## Top-1% insight

Express 5 (stable 2024) makes `async` route handlers first-class: uncaught promise rejections are automatically forwarded to the error handler without needing an `asyncHandler` wrapper. It also changes `req.query` parsing to be more secure by default (no prototype pollution via `__proto__` keys). If you're still on Express 4, the single highest-leverage upgrade is adding a global `asyncHandler` wrapper — it eliminates an entire class of production request hangs and is a two-line change.
