Node.js is single-threaded JavaScript on top of a multi-threaded C library (libuv); the event loop is the scheduler that decides which callback runs next, never two at once.

## The core

The event loop runs in phases. Each phase drains its own FIFO queue before moving to the next:

1. **timers** — callbacks from `setTimeout` / `setInterval` whose deadline has passed
2. **pending callbacks** — deferred I/O error callbacks from the previous iteration
3. **idle / prepare** — internal Node use only
4. **poll** — fetch new I/O events; block here if nothing is scheduled (up to a computed timeout)
5. **check** — `setImmediate` callbacks
6. **close callbacks** — `socket.on('close', …)`

Between every phase transition (and between each callback in some phases), Node drains two microtask queues in strict priority order:

- `process.nextTick` queue — always fully drained first
- Promise microtask queue — drained after `nextTick`

libuv maintains a thread pool (default size 4, tunable via `UV_THREADPOOL_SIZE`) for anything that would block: file-system calls, DNS resolution, crypto, zlib. Those run on pool threads; only the completion callback is posted back to the JS thread.

```ts
// Execution order demo — internalize this to never be surprised

setTimeout(() => console.log('setTimeout'), 0);        // timers phase
setImmediate(() => console.log('setImmediate'));        // check phase
process.nextTick(() => console.log('nextTick'));        // microtask (priority 1)
Promise.resolve().then(() => console.log('promise'));   // microtask (priority 2)

// Output (always):
// nextTick
// promise
// setTimeout   ← or setImmediate first if inside an I/O callback; outside it's non-deterministic
// setImmediate
```

```ts
// Blocking the loop — what you must never do in prod
import { readFileSync } from 'node:fs';

// BAD: holds the JS thread for the entire disk read
const data = readFileSync('/large-file.csv', 'utf8');

// GOOD: libuv thread pool does the I/O; JS thread is free
import { readFile } from 'node:fs/promises';
const data2 = await readFile('/large-file.csv', 'utf8');
```

## In your project

JARVIS runs a ~20-tool agent loop where each tool call — file reads, SQLite queries, HTTP to Groq/Claude — is async I/O handed off to libuv. The JS thread stays free to receive the next WebSocket voice frame while the previous tool's I/O completes on a pool thread. If any tool called `execSync` or `readFileSync`, every other connected client would freeze until it returned.

## Tradeoffs & pitfalls

- **CPU-bound work blocks everyone.** A 200ms JSON.parse on a large payload starves all other requests. Use `worker_threads` or move it to a child process.
- `process.nextTick` starvation: a recursive `nextTick` loop will never yield to I/O. Use `setImmediate` if you want to yield.
- `UV_THREADPOOL_SIZE` defaults to 4. If you make 8 concurrent `bcrypt` calls each taking 100ms, the 5th waits — tune the pool size or use a worker thread pool for heavy crypto.
- `setTimeout(fn, 0)` fires no earlier than 1ms (timer resolution). Inside an I/O callback, `setImmediate` fires before `setTimeout(fn, 0)` — the relative order outside I/O is non-deterministic.

## Top-1% insight

The poll phase blocks the thread waiting for I/O — but it does so with a calculated timeout equal to the next timer deadline. This means Node is not spinning; it truly sleeps at the OS level via `epoll`/`kqueue`/`IOCP`. The "single-threaded" model doesn't waste CPU; it's event-driven all the way down. The practical implication: a Node process at idle burns nearly zero CPU, which is why it can run dozens of microservices on a single machine cheaply. The danger isn't idle — it's a long-running synchronous operation that occupies the single JS timeslot and pushes every callback's deadline out.
