"Did we use LangChain?" — No. JARVIS's entire agentic brain is ~300 lines on the raw provider SDKs. This lesson is the decision itself: what frameworks like LangChain actually give you, what they cost, and how to know which side of the line your project is on.

## The core

**What an "AI framework" really is.** LangChain(.js), LlamaIndex, Vercel AI SDK, Haystack — they bundle four things: (1) provider abstraction (one interface over OpenAI/Anthropic/Groq), (2) pre-built patterns (agents, RAG pipelines, memory classes), (3) integrations (300+ vector DBs, loaders, tools), (4) orchestration plumbing (chains/graphs, callbacks, tracing hooks).

**The demystification.** Strip the vocabulary and each abstraction is small, ordinary code:

| Framework concept | What it actually is | In JARVIS |
|---|---|---|
| "Agent executor" | a `while` loop around a chat call | `agentStream()` in `llm.js` (~80 lines) |
| "Tool" | a JSON Schema + a function | `tools.js` — `add(def, handler)` |
| "Memory" | rows you re-insert into the prompt | `memory.js` + prompt assembly |
| "Retriever" | embed query → cosine top-k | `rag.js` `search()` (~40 lines) |
| "Chain" | functions calling functions | …functions calling functions |
| "Provider abstraction" | an `if (provider === …)` | one class, two private methods |

That table is the honest content of most framework marketing. None of it is hard; the *hard* parts (recovering malformed tool calls, context budgets, delivery state machines) are exactly the parts frameworks don't solve for you.

**Why JARVIS went raw.** Three reasons that generalize:
1. **Debuggability.** When Groq returned `400 tool_use_failed`, the fix required reading the raw error payload and re-parsing `failed_generation`. With direct SDK calls that's a stack trace away; through five framework layers, it's an archaeology dig. Your weirdest bugs live at the provider boundary — own it.
2. **Custom behavior was the product.** Streaming tool events to a voice UI, clause-level TTS splitting mid-stream, abort signals that survive tool calls — JARVIS's loop yields `{type:'text'|'tool_start'|'tool_result'}` events *because the UI needed exactly that*. Bending a framework's loop to emit those costs more than writing the loop.
3. **Dependency weight.** Two SDKs (`@anthropic-ai/sdk`, `groq-sdk`) vs a framework graph that moves fast and breaks APIs. Fewer layers, fewer surprise upgrades.

**When a framework IS the right call.** Be equally honest the other way:
- **Prototyping** — wiring RAG-over-PDFs in an afternoon to test an idea.
- **Integration breadth** — you genuinely need Pinecone today, Weaviate next month, 12 document loaders.
- **Team conventions** — a shared vocabulary and structure for many engineers building many agents.
- **Graph orchestration** (LangGraph-style) — genuinely complex multi-agent state machines with branching, checkpoints, retries-as-state.

The mature pattern: prototype with a framework, then *keep the raw rewrite small enough to be possible*. If your "agent" is one loop + tools + retrieval (most are), the rewrite is a week and removes a permanent tax.

## In your project

`package.json` tells the story: `@anthropic-ai/sdk`, `groq-sdk`, `@xenova/transformers`, `better-sqlite3` — no LangChain, no vector DB service, no orchestration layer. Embeddings run in-process; vectors live as BLOBs in SQLite; the agent loop is a generator function you can read top to bottom in one sitting. Total AI plumbing: ~600 lines you own completely.

## Tradeoffs & pitfalls

- **Don't confuse "no framework" with "no structure".** JARVIS still has the same *shapes* (loop, tools, retriever, memory) — it just owns them. Skipping the structure, not the framework, is what produces unmaintainable prompt-spaghetti.
- **Abstraction lock-in is real on both sides.** Frameworks churn (LangChain's API rewrites are famous); but hand-rolled code without tests churns too. The stable thing is the *pattern*, not the package.
- **Vector DB ≠ requirement.** Under ~100k vectors, brute-force cosine over SQLite BLOBs (JARVIS's approach) is milliseconds. Reach for pgvector/Pinecone when scale demands it, not by default.

## Top-1% insight

Interviewers use the framework question as a depth probe. "We used LangChain" answered *without being able to describe the loop inside it* reads as assembly-by-tutorial. The top-1% answer names the tradeoff explicitly: *"I wrote the loop raw because my failure modes were at the provider boundary and my UI needed custom stream events — here's the 400-recovery that justified it. I'd reach for LangGraph if I had a 10-node multi-agent graph."* Owning the decision in both directions — that's the signal. The framework is never the skill; the loop is.

## Feynman check

Explain: (1) what an "agent executor" is in ≤10 words; (2) the strongest reason JARVIS skipped LangChain and the strongest reason another project shouldn't; (3) why the provider boundary is where the worst bugs live.
