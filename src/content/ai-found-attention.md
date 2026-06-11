Attention is a soft database lookup: every word publishes what it's looking for (Query), what it offers (Key), and what it actually carries (Value) — then each word gathers a weighted blend of everyone else's Values. That single trick is the transformer, and the transformer is every modern LLM.

## The core

**The problem it solved.** In "The trophy didn't fit in the suitcase because *it* was too big" — what is "it"? Older models read left-to-right with a fading memory; by the time they hit "it", the trophy was a blur. Attention lets "it" look directly at *every* other word in the sentence at once and ask: *who matters to me?*

**The library analogy.** You walk into a library with a question on a card (**Q**uery). Every book has a title on its spine (**K**ey) and contents inside (**V**alue). You compare your card to every spine, score each match, then read a *blend* of the books weighted by match strength. Nobody picks one book — you read 70% of the trophy book, 25% of the suitcase book, 5% of everything else.

```js
// Self-attention for one token, in plain JS. This is the whole mechanism.
function attend(q, keys, values) {
  // 1. Score: how well does my query match each key? (dot product)
  const scores = keys.map(k => dot(q, k) / Math.sqrt(q.length)); // scale for stability
  // 2. Softmax: turn scores into weights that sum to 1
  const max = Math.max(...scores);
  const exps = scores.map(s => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const weights = exps.map(e => e / sum);
  // 3. Blend: weighted sum of everyone's values
  return values[0].map((_, d) =>
    values.reduce((acc, v, i) => acc + weights[i] * v[d], 0));
}
```

**Multi-head = multiple questions at once.** One attention "head" might track grammar (*what's the subject?*), another coreference (*what does "it" point to?*), another tone. Transformers run dozens of heads in parallel per layer and concatenate their answers.

**Why this architecture won.** Attention has no left-to-right bottleneck — every token reaches every token in one step, and all of it is matrix multiplication, which GPUs devour in parallel. RNNs had to process word 1 before word 2; transformers process the whole context simultaneously. Scale-friendliness, not cleverness, is why transformers ate the field.

**The price: the context window.** Every token attends to every other token — n² pairs. Double the context, quadruple the cost. That is *the* reason context windows exist and why models forget what fell outside them: tokens beyond the window aren't "forgotten," they were never in the room.

## In your project

- JARVIS's prompt budget (`MAX_PROMPT_CHARS = 12000` in `server/index.js`) exists because of n² attention cost — every character you stuff into the system prompt is paid for at attention time, on every generated token.
- MiniLM in `embeddings.js` is 6 transformer layers; the 384-dim vector you store in SQLite is the attention-refined summary of the whole sentence (mean-pooled).
- When the agent loop appends tool results to the conversation, the model "sees" them purely because attention lets the next generation step look back at those tokens directly.

## Tradeoffs & pitfalls

- **Lost in the middle.** Models attend most sharply to the start and end of a long context. Burying the critical instruction in the middle of 10k tokens measurably degrades compliance — put rules first, data last.
- **Attention is not understanding.** It's similarity-weighted blending. It explains *how* information moves, not *whether* the model is right.
- **Context ≠ memory.** Attention gives perfect recall *inside* the window and zero outside it. Persistent memory must be engineered around the model (JARVIS's `memory.js`), never assumed.

## Top-1% insight

The KV cache is why chat feels fast. During generation, the Keys and Values of all previous tokens don't change — so they're computed once and cached. Each new token only computes its own Q/K/V and attends to the cached past, making generation linear instead of quadratic per token. This is also exactly why **prompt caching** (Anthropic/OpenAI feature) is priced ~10× cheaper for cached tokens: the provider literally reuses the KV tensors of your unchanged system prompt. A stable prompt prefix isn't style advice — it's a cache key.

## Feynman check

Explain: (1) Q, K, V using the library card analogy; (2) why doubling the context window doesn't double the cost; (3) what the model literally "sees" of a tool result that JARVIS appends to the conversation.
