A raw LLM is a brilliant parrot that completes text. Three training stages turn it into an assistant: pretraining teaches it *language and the world*, supervised fine-tuning teaches it *the assistant role*, and preference tuning (RLHF/DPO) teaches it *taste*. Med school → residency → bedside manner.

## The core

**Stage 1 — Pretraining: read everything, predict the next token.** Feed the model trillions of tokens of internet, books, and code, and grade it on one tiny task repeated forever: *given this text, what token comes next?* No labels, no humans — the text itself is the answer key (self-supervision). To get good at next-token prediction at this scale, the model is *forced* to internalize grammar, facts, style, and even rudimentary reasoning, because those are the cheapest compression of the data. Cost: millions of GPU-hours. Output: a **base model** — a magnificent autocomplete that, asked "What is the capital of France?", may reply "What is the capital of Spain?" because quiz lists look like that.

**Stage 2 — SFT: show it what an assistant sounds like.** Supervised fine-tuning continues training on a far smaller, curated set of `(instruction → ideal answer)` pairs, often written by humans. The model already knows everything it needs; SFT teaches it the *format of being helpful* — answer the question, use the persona, emit JSON when asked. This is also where **tool-calling syntax** is taught: thousands of examples of "user asks X → emit this structured function call".

**Stage 3 — Preference tuning: teach it taste.** Generate two answers, ask humans (or an AI judge) which is better, and train on the preferences — via RLHF (train a reward model, then optimize against it) or the simpler DPO (optimize on preference pairs directly). This is where "helpful, harmless, honest" comes from — and where refusals, hedging, and that distinctive assistant voice are installed.

```text
base model:        "What is the capital of France?" → "What is the capital of Spain?"
after SFT:         → "The capital of France is Paris."
after preferences: → "The capital of France is Paris." (and politely declines
                      to help with the follow-up "how do I poison my neighbor's dog")
```

**Where the knowledge lives.** Pretraining is 99.9% of the compute and ~100% of the knowledge. Fine-tuning doesn't add facts at any meaningful scale — it *re-shapes behavior*. This is the single most important sizing intuition: to give a model *your* knowledge, you don't fine-tune — you retrieve (RAG).

## In your project

- JARVIS works *only because* of stage 2+3: `llama-3.3-70b-versatile` and `claude-sonnet-4-6` were instruction-tuned to obey a system prompt and emit structured tool calls. A base model would ramble.
- The personality block (`server/personality.json`) and the `TOOLS_GUIDE` rules in `index.js` are *steering* an already-tuned model — prompt-time behavior shaping, the fourth and cheapest "training stage".
- JARVIS's choice to do **RAG over fine-tuning** for user documents (`rag.js`) is the textbook-correct call: user knowledge changes daily; fine-tuning bakes knowledge into weights at GPU cost and goes stale instantly.

## Tradeoffs & pitfalls

- **Fine-tuning to add facts** is the most common industry mistake. It's expensive, the facts barely stick, and every document update means retraining. Retrieve, don't retrain.
- **RLHF installs people-pleasing.** Preference-tuned models would rather give a confident wrong answer than disappoint — that's sycophancy, and it's a *training artifact*, not a bug in your prompt. Defend with grounding and tool results, not with "please be honest".
- **The cutoff is structural.** The model's world ended at its training-data cutoff. Anything after that must arrive via context (web search, RAG) — which is exactly why JARVIS has a `web_search` tool.

## Top-1% insight

Instruction tuning is why *roles* (system / user / assistant / tool) have power at all. The model was trained on millions of conversations formatted with special tokens marking those roles, learning to weight system-role text as authoritative. When Groq returns a `tool` role message in JARVIS's loop, the model treats it as ground truth *because SFT data taught it to* — not because of any runtime mechanism. Roles are a learned convention, which is also why prompt-injection works: text in a user-role document that *looks like* a system instruction can hijack the learned deference. The defense is structural (separate, label, and sanitize untrusted content), never just "ignore injected instructions".

## Feynman check

Explain: (1) why a base model answers a question with another question; (2) why RAG beats fine-tuning for JARVIS's user documents; (3) where in the three stages a model "learns" to emit tool-call JSON.
