JARVIS is a voice-first personal AI assistant built on a Node.js/Express server with a React/Zustand frontend, featuring a multi-turn agentic tool-calling loop, local RAG over user documents, and a proactive intelligence engine — all wired together over a single persistent WebSocket connection.

## Architecture

The system has three layers talking through a single WebSocket channel:

```
Browser (React + Zustand)
  Web Speech API → mic transcription
  Audio queue → indexed mp3 files via /audio/:file
        │
        │  WebSocket (ws library, single persistent socket)
        │  Events: thinking | text_chunk | tool | audio | response_complete
        ▼
Node.js / Express  (:3000)
  ├── index.js          WebSocket orchestration, system-prompt assembly, interrupt/barge-in
  │     │
  │     ├── llm.js      LLMService — agentStream() multi-turn loop (≤6 iters, MAX_ITERS)
  │     │   ├── _claudeAgent  — streaming tool-calls on content_block_delta events
  │     │   └── _groqAgent    — non-streaming per-turn (streaming unreliable on Llama)
  │     │
  │     ├── tools.js    buildTools() — ~20 JSON-schema tools; conditional on .ready flags
  │     │               execute() dispatcher — guards required args before calling handler
  │     │
  │     ├── rag.js      RAGService — chunk (900 chars, 150 overlap) → embed → SQLite BLOB
  │     │               search() — cosine sim ≥ 0.25; keyword fallback if model not ready
  │     │
  │     ├── embeddings.js  @xenova/transformers, Xenova/all-MiniLM-L6-v2, 384 dims, ~50 MB
  │     │                  lazy singleton init; Float32Array serialized as SQLite BLOB
  │     │
  │     ├── memory.js   better-sqlite3 (WAL mode) — conversations, memories, tasks, notes,
  │     │               relationships, preferences, routines, follow_ups, app_config
  │     │               searchMemories() — semantic with decay scoring; keyword fallback
  │     │
  │     ├── tts.js      TTSService — spawns `python3 -m edge_tts`; clause-level splitting
  │     │               shouldSplitForTTS / splitAtBreak — splits on sentence end OR
  │     │               clause (comma/dash) when buffer ≥ 30 chars; audio files in /audio
  │     │
  │     └── briefing.js  BriefingService — node-cron daily LLM-composed briefing
  │         followup.js  FollowUpService — detects follow-up opportunities, delivers live
  │
  └── SQLite DB (jarvis_memory.db, DATA_DIR, WAL mode)
      app_config table → keys survive redeploys when .env is read-only (Railway)
```

Provider auto-detection: if `ANTHROPIC_API_KEY` is a real key (non-placeholder), `LLMService` uses `claude-sonnet-4-6`; otherwise Groq uses `llama-3.3-70b-versatile`. The fast model (`claude-haiku-4-5-20251001` / `llama-3.1-8b-instant`) is used for background tasks and as a rate-limit fallback.

## Three decisions you must justify

**Decision 1: Local all-MiniLM-L6-v2 embeddings via @xenova/transformers instead of an API**

The decision: embed user documents and memory entries fully offline using the Xenova ONNX port of `all-MiniLM-L6-v2` (384 dimensions, ~50 MB download, runs in Node.js).

Why: documents contain private user data. Sending every chunk to an embeddings API would leak that content to a third party on every upload and every search — unacceptable for a personal assistant. Offline inference eliminates that risk entirely, removes per-token cost, and keeps the system functional with no internet.

Alternative rejected: OpenAI `text-embedding-3-small` or Cohere's API. Both produce higher-quality vectors and require no local compute, but they demand network access, cost money per query, and expose all document content to a third-party API.

Tradeoff accepted: first model load downloads ~50 MB and takes several seconds; if it fails, the system transparently falls back to SQLite LIKE keyword search. The embedding quality (384 dims, MiniLM) is lower than `text-embedding-3-large`, which may cause slightly lower retrieval recall on long or nuanced queries.

---

**Decision 2: Groq's agent loop runs non-streaming (one non-streaming request per turn); Claude's runs streaming**

The decision: `_claudeAgent` in `llm.js` uses the streaming API with `content_block_delta` events; `_groqAgent` uses non-streaming `chat.completions.create` per turn.

Why: Groq's streaming mode for tool calls was found unreliable in practice — Llama 3.3 70B frequently emits tool calls as raw text in the "functionary" format (`<function=name>{json}</function>`) rather than through the `tool_calls` channel, causing Groq's server to return a `tool_use_failed` error with code `tool_use_failed` and hand back the generation text in `failed_generation`. The code has dedicated `parseLlamaToolCalls`, `extractBalancedJson`, and `coerceToJsonString` helpers that parse and recover these text-format tool calls. Non-streaming avoids the streaming instability while Groq/Llama is fast enough (~hundreds tok/s) that the difference is imperceptible.

Alternative rejected: streaming on both providers, with the same recovery shim. The shim works, but it fires on partial streams, making recovery fragile — a half-delivered stream on Groq produces incomplete `failed_generation` text that is harder to parse.

Tradeoff accepted: no incremental text delivery on Groq turns; each tool-calling loop iteration blocks until the full non-streaming response arrives. For the Claude path (the recommended production path), full streaming is preserved.

---

**Decision 3: System-prompt budget cap at 12,000 characters with section truncation**

The decision: in `index.js`, the system prompt is assembled with a `MAX_PROMPT_CHARS = 12000` guard. Memory, mood, reminders, and Phase 4 context sections are added in priority order; any section that would overflow the cap is sliced to the remaining budget and suffixed with `[...truncated]`.

Why: LLMs degrade on extremely long system prompts (attention dilution, higher latency, higher cost). More concretely, Groq's `llama-3.3-70b-versatile` has a context window that is shared between system + conversation history + tool schemas + assistant response — loading unbounded memory context risks hitting the limit mid-conversation and causing a hard API error.

Alternative rejected: no cap, inject everything. Simple but causes unpredictable failures at scale and inflates per-turn cost on Claude, where token pricing is significant.

Tradeoff accepted: a user with a very rich profile and long memory may have older context silently truncated. The priority ordering (base prompt → memory → mood → reminders → Phase 4) means the most recent contextual signals survive and older relationship/routine context is what gets cut.

---

**Decision 4: Tools are exposed conditionally based on integration `.ready` flags**

The decision: `buildTools()` only calls `add(...)` for calendar, email, smarthome, music, web search, and weather tools when the corresponding service's `.ready` flag is `true` (or the API key is set). The tool list passed to the LLM therefore only contains tools the system can actually execute.

Why: if unavailable tools are listed in the schema, the model may call them. A tool call returning "not configured" wastes a loop iteration, confuses the model, and produces a bad user experience. The `get_integration_status` tool lets the model report status honestly without hallucinating capability.

Alternative rejected: always expose all tools, return "not configured" errors from the handler. Simpler registry logic, but causes the multi-turn loop to spend iterations recovering from predictable errors.

Tradeoff: the tool list is dynamic and re-built each turn. Any service that becomes ready mid-session (e.g., Google Calendar OAuth completes) requires a new turn to expose its tools, since `buildTools` is called inside the message handler.

## The hardest bug

**Bug: interrupt race condition — aborted turn stomping the freshly-started next turn**

Symptom: after the user pressed Escape (barge-in) mid-response, the follow-up message sent immediately afterward would silently fail — `isProcessing` stayed `true` after the aborted turn's `finally` block ran, permanently deadlocking the session.

Root cause: the WebSocket handler uses a single shared `isProcessing` flag and a single shared `abortController` reference per connected client. When the user interrupted, the `interrupt` handler called `abortController.abort()` and returned. Meanwhile the original streaming request was still executing asynchronously inside `agentStream`; when it eventually caught the abort signal and reached its `finally` block, it executed `isProcessing = false; abortController = null`. But if the user had typed a new message before `finally` ran, the new turn set a new `myController` and stored it in `abortController`. The old turn's `finally` then cleared `abortController` (which now pointed to the new turn's controller), leaving `isProcessing = false` AND a `null` controller — or worse, if the old `finally` ran after `isProcessing` was set back to `true` by the new turn, it reset `isProcessing = false` prematurely, unblocking a third message before the second finished.

Fix (in `index.js`): the `finally` block was changed to guard: `if (abortController === myController) { isProcessing = false; abortController = null; }`. Each turn captures a reference to its own `AbortController` at creation time as `myController`. Only the turn that still owns `abortController` (i.e., whose controller was not replaced by a newer turn) is allowed to clear shared state. Additionally, the interrupt handler intentionally does NOT clear `isProcessing` — it only calls `.abort()`, relying on the owning `finally` to do cleanup. This identity guard is the entire fix and is called out in the inline comments as bugs `#2` and `#3` in `server/index.js`.

## What you'd change at scale

**Stateful WebSocket per-process breaks horizontal scaling.** `connectedClients` is an in-process `Set`. A second Railway instance would not receive reminders or proactive push events for clients connected to the first. Fix: move live delivery to Redis Pub/Sub; each instance subscribes and fans out to its own local clients.

**SQLite is a single-writer bottleneck.** WAL mode handles a single assistant well, but concurrent users (family sharing, SaaS) would serialize all writes. Migration path: Postgres with pgvector for the embedding columns, which also removes the custom `Float32Array` BLOB serialization.

**The embedding model loads once per process, not per-request.** If the Node.js process restarts, the ~50 MB model must re-download/re-load before semantic search works. At scale, this cold-start penalty is unacceptable. Fix: run the embedding model in a sidecar Python service (FastAPI + sentence-transformers) with a persistent process, and call it via HTTP.

**Tool result context is unbounded.** A `web_search` result or full email thread injected into the conversation history on every loop iteration grows the context linearly. At 6 iterations with verbose tool results, the conversation can hit 10k+ tokens before the LLM produces its final answer. Fix: implement result summarization — after each tool result, pass it through the fast model to produce a 2–3 sentence summary before appending to `convo`.

**Audio file cleanup is time-based, not demand-based.** `tts.cleanup()` runs every 5 minutes and deletes files older than 5 minutes. Under high concurrency, files accumulate faster than the cleanup interval. Fix: reference-count files and delete immediately after the client acknowledges receipt via WebSocket.

## Probing Q&A

**Q: Walk me through your chunking strategy — why 900 characters with 150 of overlap?**

A: In `rag.js`, the chunker targets 900 characters per chunk, preferring to break at a paragraph boundary (`\n\n`) if one falls within the last 50% of the target window; failing that it breaks at a sentence boundary (`". "`, `"! "`, `"? "`); failing that it breaks hard at the character limit. The 150-character overlap means each chunk shares roughly one sentence of context with the next, so a retrieval hit near a chunk boundary still includes the sentence that bridges the two. The 900-char target lands a chunk at roughly 180–220 tokens with MiniLM's tokenization, which is large enough to contain a coherent idea but small enough that cosine similarity to a short query stays meaningful — larger chunks dilute the signal.

---

**Q: How does the agent decide when to stop calling tools?**

A: The loop in `_claudeAgent` and `_groqAgent` runs at most `MAX_ITERS = 6` iterations. Each iteration: stream one LLM turn; if it produces tool calls, execute them all in parallel within that turn, append results to `convo`, then loop. If the LLM produces a turn with zero tool calls, `return` exits the generator — that is the terminal condition. If all 6 iterations are exhausted without a zero-tool-call turn, both implementations fall through to a final no-tool-schema request that forces a closing prose answer. So termination has two paths: the model decides to stop calling tools, or the hard iteration budget runs out.

---

**Q: Why use local MiniLM embeddings instead of an embeddings API?**

A: The user's uploaded documents are private notes, project briefs, personal files. Sending every chunk to an external API on upload and on every search exposes that content to a third party on every query — that is a privacy violation incompatible with a personal assistant's trust model. The `@xenova/transformers` port of `all-MiniLM-L6-v2` runs fully in-process in Node.js, requires no network call after the one-time ~50 MB download, and has zero per-query cost. The tradeoff is a slightly lower retrieval quality (384-dim MiniLM vs. 1536-dim `text-embedding-3-small`) and a cold-start delay on first load. Both are acceptable for the use case.

---

**Q: How do you prevent prompt injection from a retrieved document?**

A: The RAG context is injected into the system prompt under a clearly labelled `[Source N: "title"]` header via `formatForContext()` in `rag.js`. The system prompt and TOOLS_GUIDE explicitly instruct the model: "NEVER claim you performed an action unless the tool returned success" and set up a tool-use-only action model. The model cannot call tools by having text in a document that says "call set_reminder" — tool calls require structured JSON in the `tool_calls` / `content_block_delta` API channel, not prose. That said, this is a partial mitigation: a malicious document could still influence the prose response or cause the model to misattribute information. A stronger fix would be to sandbox retrieved content behind a separate model call that returns only structured facts.

---

**Q: How does clause-level TTS splitting reduce latency?**

A: The naive approach waits for a full sentence terminator (`.`, `!`, `?`) before calling `tts.synthesize()`. For a long sentence like "Based on your calendar, you have three meetings today, starting with the standup at nine, then the design review at noon, and the retrospective at four", the user would hear nothing for 3–4 seconds. In `tts.js`, `shouldSplitForTTS` also fires on clause boundaries (`,`, `-`, `:`, `—`) once the buffer exceeds 30 characters, calling `splitAtBreak` which finds the last such boundary at or past index 15 and flushes everything before it to TTS immediately. This means the first clause ("Based on your calendar") starts synthesizing while the server is still streaming the rest of the sentence — cutting the time-to-first-audio by roughly 40–60% on long sentences.

---

**Q: Why persist integration keys to the `app_config` SQLite table in addition to writing `.env`?**

A: On Railway and most container platforms, the filesystem is ephemeral — redeploys or restarts reset the container image, wiping any runtime writes to `.env`. The setup wizard saves keys to `process.env` immediately AND to the `app_config` table via `memory.setAppConfig()`. On startup, `index.js` reads `app_config` and hydrates any key not already in `process.env`. This means credentials configured through the UI survive redeploys without needing a mounted volume or manual env-var management in the platform dashboard. The fallback write to `.env` is still attempted for local dev convenience, but the code explicitly handles the case where `.env` is not writable.

---

**Q: What happens when a user sends a message while JARVIS is still speaking — the barge-in case?**

A: The client sends `{ type: "interrupt" }` over the WebSocket (triggered by pressing Escape). The server's interrupt handler calls `abortController.abort()`, which signals the `AbortSignal` passed to `llm.agentStream()` and to each `tts.synthesize()` call. The streaming loop checks `myController.signal.aborted` at every `yield` and after every `await`. Orphaned TTS synthesize promises have an abort guard (`if (!myController.signal.aborted)`) so they don't send audio URL messages after the interrupt. Any partial response accumulated in `currentPartialResponse` is saved to the conversation history with a `[interrupted by user]` suffix. The `finally` block clears state only if the clearing turn still owns `abortController` (identity guard), preventing the new turn from being stomped.

---

**Q: How does the memory decay scoring work, and why?**

A: In `memory.js`, `searchMemories()` computes a composite score: `score = cosineSimilarity + accessBoost + importanceBoost - recencyDecay`. The boosts are: `log2(1 + access_count) * 0.05` (each doubling of accesses adds 0.05), `(importance - 1) * 0.03` (importance levels above 1 add 0.03 each), and `daysSinceAccess * 0.005` subtracted as a decay term (5 days of inactivity costs 0.025, roughly equivalent to one full importance level). The rationale is that raw cosine similarity on a 384-dim vector is a noisy estimate of relevance for personal assistant data — a highly relevant memory that was accessed twenty times in the last week should outrank a marginally higher cosine-similarity hit that was stored six months ago and never retrieved. The decay is mild enough that old but important memories can still surface if their semantic match is strong.
