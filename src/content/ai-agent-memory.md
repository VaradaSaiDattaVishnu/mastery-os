An LLM has perfect recall inside its context window and total amnesia outside it. Agent memory is the engineering around that fact: a fast small "RAM" (the prompt) backed by a permanent "disk" (a database), with pipelines that decide what gets written down, what gets recalled, and what gets forgotten.

## The core

**The hierarchy.** Think of it exactly like a computer:

- **RAM = the context window.** Whatever is in the prompt right now is all the model knows. Fast, tiny, wiped every request.
- **Disk = the memory store.** SQLite/Postgres/vector DB rows that survive forever — but the model can't see them until you *load them into RAM* (paste them into the prompt).
- **The OS = your code**, deciding what to page in and out.

**Write path: extraction.** After every exchange, JARVIS fires background LLM calls that read the conversation and pull out durable facts — each with a category, importance score, and keywords:

```js
// server/index.js — after each reply, non-blocking background extraction
memory.extractMemoriesFromExchange(llm, userText, fullResponse).catch(...)
memory.extractRelationships(llm, userText, fullResponse).catch(...)   // people
memory.extractPreferences(llm, userText, fullResponse).catch(...)    // likes/dislikes
memory.extractTasks(llm, userText, fullResponse).catch(...)          // to-dos
memory.updateUserModel(llm, userText, fullResponse).catch(...)       // profile
```

The extractor prompt forces strict JSON ("Return ONLY a JSON array…") so the output is machine-writable. Using the model to decide *what's worth remembering* is the trick — you can't regex your way to "user's sister is named Priya and the interview is Thursday."

**Read path: semantic recall.** Each new user message is embedded (MiniLM, 384-dim) and compared by cosine similarity against every stored memory's embedding; the top matches get pasted into the system prompt as `[MEMORIES FROM PAST CONVERSATIONS]`. Meaning-based recall beats keywords: "how did my meeting go" retrieves the memory about "the standup with the VP".

**Forgetting is a feature.** JARVIS decays memories: low-importance rows expire (`cleanupDecayedMemories`, hourly), important ones persist. Without decay, recall quality degrades as thousands of trivia rows crowd the top-k — an unbounded memory store is a slow-motion outage.

**Consolidation.** On disconnect, the whole session is summarized into one compact row (`summarizeSession`) — the agent equivalent of "sleep on it": cheap to store, cheap to recall, and it preserves narrative context that individual fact-rows lose.

## In your project

`server/memory.js` (~1,200 lines) is the largest file in JARVIS for a reason — memory *is* the product. The same embedding service is shared by memories, notes, and RAG document chunks, all stored as BLOBs in one SQLite file. The system prompt is assembled per-turn from: recalled memories + user profile + mood + pending tasks + relationships + recent summaries — that's the "page-in" step.

## Tradeoffs & pitfalls

- **Extraction costs a model call per turn.** JARVIS routes extraction to the *fast/cheap* model (`fastModel`), never the big one — background jobs don't need brilliance.
- **Store the fact, not the transcript.** Raw chat logs are write-cheap but recall-poison: they're long, redundant, and bury the signal. Extract → store atoms.
- **Memory poisoning.** If the model hallucinates during extraction ("user is a doctor" from a joke), the lie gets recalled forever as truth. Mitigate with importance thresholds, dedup checks (JARVIS compares new memories against existing ones by similarity before inserting), and user-visible memory management (a "forget that" path — JARVIS's privacy commands).
- **Privacy is a memory-system requirement.** "Go off the record" must gate the *write path* (JARVIS checks `privacy.isOffTheRecord(sessionId)` before saving anything), not just the UI.

## Top-1% insight

The highest-leverage design choice is *granularity*: one fact per row. JARVIS stores "User's interview at Google is on Thursday" — not the paragraph it came from. Atomic memories compose (any subset can be recalled together), dedupe (cosine similarity between two atoms is meaningful), and decay independently. The moment you store multi-fact blobs, every downstream system — recall ranking, dedup, contradiction handling, forgetting — gets an order of magnitude harder. Atomicity in memory stores is the same discipline as normalization in databases, and it pays off the same way.

## Feynman check

Explain: (1) the RAM/disk analogy and where the "paging" happens in JARVIS; (2) why extraction uses an LLM instead of rules; (3) why memories must decay — what actually breaks if they don't?
