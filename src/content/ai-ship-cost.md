Every token costs money and milliseconds. AI cost engineering is one repeated question — *"does this call need the big model, or any model at all?"* — asked at every point in the system. JARVIS runs a full assistant (agent + RAG + mood + memory + proactive) on a **$0/month** stack; this lesson is how.

## The core

**Tiering: the right brain for each job.** Not all calls are equal. JARVIS holds two models per provider and routes by stakes:

```js
// server/llm.js
this.model     = 'llama-3.3-70b-versatile'; // user-facing reasoning + tools
this.fastModel = 'llama-3.1-8b-instant';    // background extraction, mood, summaries
```

The user-facing turn gets the 70B. The ~7 background calls *per turn* (memory extraction, relationships, preferences, entities, mood, follow-up detection, profile) all run on the 8B — they're simple classification/extraction jobs where the big model adds cost, not quality. That one routing decision cuts total token spend several-fold.

**Degrade under pressure.** Rate-limited (Groq free tier: 12k tokens/min)? Don't fail — *step down*:

```js
} catch (error) {
  if (error.status === 429) {
    console.log('⚡ Rate limited, falling back to fast model');
    return await mkRequest(this.fastModel, Math.min(maxTokens, 1024), useTools);
  }
```

A slightly-worse answer beats an error toast every time. Note it also *shrinks max_tokens* on the fallback — degrading twice in one move.

**$0 where models are commodities.** Embeddings are the canonical example: API embeddings bill per token forever; JARVIS runs MiniLM (22MB) *in-process* via `@xenova/transformers` — every memory, note, and document chunk embedded free, offline, in milliseconds. Same for TTS (edge-tts neural voices, free) and ASR (the browser's). The LLM is the only metered component left.

**Latency is a cost too — pay it once.** The embedding model used to download (~50MB) on first use after every deploy: first document upload took 25 seconds and looked broken. The fix: bake the model into the Docker image at *build* time:

```dockerfile
ENV TRANSFORMERS_CACHE=/app/.cache/transformers
RUN node -e "...pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2')..."  # download at build
```

Upload time: 25s → **0.5s**. The general rule: anything deterministic and slow (model downloads, warmups, index builds) belongs in the build, not the request path.

**Caps are billing safety.** Every loop that touches a paid API has a ceiling: agent iterations (`MAX_ITERS = 6`), `max_tokens` per call (2048 reasoning / 1024 background), prompt budget (12k chars), history window (~20 messages). An uncapped agent loop plus a confused model is an invoice, not a bug report.

**Token diet.** The prompt-budget loop and connected-only tool schemas (a disconnected tool costs ~50–150 tokens/turn for nothing) are *cost* features as much as quality features — input tokens are billed on every single turn.

## In your project

The whole bill of materials: Groq free tier (LLM) + local MiniLM (embeddings) + edge-tts (voice) + browser ASR + SQLite (storage, including vectors) = a complete agentic voice assistant with zero marginal cost per conversation. Adding `ANTHROPIC_API_KEY` upgrades the brain — the architecture makes the spend *opt-in*, per capability, instead of structural.

## Tradeoffs & pitfalls

- **Cheap-model false economy.** Route a genuinely hard reasoning task to the 8B and you'll pay for it in retries and wrong tool calls. Tier by *task difficulty*, audit by sampling outputs.
- **Local models cost RAM/CPU.** MiniLM in-process is free per call but lives in your container's memory budget. At high QPS, that trade flips.
- **Free tiers are SLAs of zero.** The 429 fallback isn't optional polish on a free tier — it *is* the reliability story. Design for the limit, not the average.
- **Watch background multiplication.** "One user message" = 1 big call + ~7 small ones + embeddings. Per-feature token accounting catches the 10× surprise before the bill does.

## Top-1% insight

The most leveraged line in any AI codebase is the model-selection line, because cost asymmetry between tiers is 10–30× while quality asymmetry *on easy tasks* is near zero. The senior move is making routing a **first-class, per-call decision** — JARVIS's `chat(system, msgs, { useMainModel })` flag — so every new feature must consciously pick its tier. Teams whose abstraction hides model choice behind one global default always converge to "everything on the expensive model", and the bill scales with traffic instead of with difficulty. Expose the knob; force the question.

## Feynman check

Explain: (1) why background extraction belongs on the small model — what's the actual quality risk?; (2) why baking the model into the image moved 25 seconds from the user to the build server; (3) why every loop needs a cap, in billing terms.
