Promises model a value that will exist in the future; streams model a sequence of values that arrive over time — and backpressure is the mechanism that keeps producers from drowning consumers.

## The core

**Promise lifecycle:** `pending → fulfilled | rejected`. A `.then` callback is always async (posted to the microtask queue), even if the promise is already settled. `async/await` is syntax sugar that compiles to a state machine around `Promise.then` — the `await` expression suspends the current function and returns control to the caller (and the event loop) until the awaited promise settles.

**Streams** in Node are `EventEmitter`-based objects implementing one of four interfaces: `Readable`, `Writable`, `Duplex` (both), or `Transform` (duplex with a transform step). The critical mechanism is **backpressure**: `writable.write()` returns `false` when its internal buffer is full. A responsible readable must pause itself when `write()` returns `false` and resume only on the `'drain'` event. `stream.pipeline()` handles this automatically and tears down all streams on error.

```ts
// async/await — what the state machine looks like
async function fetchUser(id: string) {
  // suspends here; event loop can handle other callbacks
  const row = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return row;
}

// Concurrent I/O — don't await sequentially when work is independent
async function loadDashboard(userId: string) {
  // BAD: 200ms + 150ms = 350ms total
  // const user = await getUser(userId);
  // const orders = await getOrders(userId);

  // GOOD: both fire at once, total ≈ max(200, 150) = 200ms
  const [user, orders] = await Promise.all([
    getUser(userId),
    getOrders(userId),
  ]);
  return { user, orders };
}
```

```ts
// Streams with backpressure — the right way to pipe large data
import { createReadStream, createWriteStream } from 'node:fs';
import { Transform, pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { createGzip } from 'node:zlib';

const pipelineAsync = promisify(pipeline);

async function compressFile(src: string, dest: string) {
  await pipelineAsync(
    createReadStream(src),          // Readable
    createGzip(),                   // Transform (compress)
    createWriteStream(dest),        // Writable
    // pipeline: wires backpressure and cleans up on any error
  );
}

// Async iteration — cleaner for consuming streams
async function processLines(readable: NodeJS.ReadableStream) {
  for await (const chunk of readable) {
    // each chunk is delivered only as fast as we consume it
    await processChunk(chunk);
  }
}
```

## In your project

JARVIS streams TTS audio from Edge-TTS back to the client. The Edge-TTS response is a `Readable`; the WebSocket is a `Writable`-ish sink. Without backpressure, if Edge-TTS produces audio faster than the client can receive it (slow mobile connection), the server-side buffer for that WebSocket would grow unboundedly and eventually crash the process. Using `pipeline` or manual drain-handling ties the production rate to the consumption rate — a key reason the voice streaming doesn't blow up under load.

## Tradeoffs & pitfalls

- `Promise.all` fails fast: one rejection rejects the whole batch. Use `Promise.allSettled` when you need all results regardless of partial failure.
- Unhandled promise rejections crash Node 15+ by default. Always attach `.catch()` or wrap in try/catch.
- `for await...of` on an async generator is lazy — it pulls one item at a time. `Promise.all` over an array is eager — all items fire immediately. Know which you need.
- Streams in "flowing mode" (adding a `'data'` listener) start emitting immediately. If your consumer isn't ready, you lose data. Prefer `pipeline` or `async iteration`.
- Never mix callbacks and promises over the same resource — double-resolution bugs are subtle.

## Top-1% insight

`stream.pipeline()` does three things that manual piping misses: it tears down all streams in the chain on error (preventing fd leaks), it handles backpressure across every pair of streams, and it calls `destroy()` rather than `end()` on error so half-open TCP connections are properly closed. The `promisify(pipeline)` pattern gives you all of that plus `async/await` ergonomics. In production services that process large files or proxy external streams (like JARVIS proxying TTS audio), this single function prevents the most common resource-leak class in Node applications.
