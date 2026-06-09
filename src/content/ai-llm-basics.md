An LLM is a probability machine: given a sequence of tokens, it estimates a distribution over the next token — then samples from it. Everything emerges from doing that billions of times on billions of tokens.

## The core

**Tokenization.** Text is split into sub-word units (BPE or SentencePiece). "unhappy" might be `["un", "happy"]`. Token count, not character count, is what fills your context window. Spaces, punctuation, and non-ASCII content tokenize inefficiently — important when you're paying per token.

**Attention.** Each token in the context attends to every other token via learned queries, keys, and values. The attention score between token i and token j is:

```
score(i,j) = softmax( Q_i · K_j / sqrt(d_k) ) · V_j
```

The `sqrt(d_k)` stabilises gradients. The output for each position is a weighted sum of values — that's how context "flows" across the sequence. Transformers are quadratic in sequence length: doubling context length quadruples attention compute.

**Sampling.** The model outputs logits (raw scores) over its vocabulary (~50k tokens). Temperature scales them before softmax: temperature=1.0 is the raw distribution, <1.0 sharpens it (more deterministic), >1.0 flattens it (more random). `top_p` (nucleus sampling) keeps only the smallest set of tokens whose cumulative probability exceeds p, then samples from that set. `top_k` just keeps the k highest-scoring tokens.

```python
import tiktoken

enc = tiktoken.encoding_for_model("gpt-4o")
tokens = enc.encode("What is the capital of France?")
print(tokens)          # [3923, 374, 279, 6864, 315, 9822, 30]
print(len(tokens))     # 7 — not 30 characters

# Groq / OpenAI-compatible call with controlled sampling
from groq import Groq

client = Groq()
response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "What is 2+2?"}],
    temperature=0.0,   # deterministic
    top_p=1.0,
    max_tokens=16,
)
print(response.choices[0].message.content)
```

## In your project

JARVIS uses Groq's llama-3.3-70b and Claude interchangeably. Understanding that both are next-token predictors with the same temperature/top_p knobs is why the provider abstraction works at all — the sampling API surface is nearly identical regardless of the underlying architecture.

## Tradeoffs & pitfalls

- **Context window isn't free.** Stuffing 128k tokens costs memory quadratically in attention; inference providers charge per token and add latency.
- **Temperature=0 is not truly deterministic** across providers — floating-point ordering in parallel GPU operations can vary.
- **Hallucination is a sampling event.** A confident wrong answer is just a high-probability wrong token sequence. Temperature=0 doesn't eliminate it; it makes the model more committed to its errors.
- **Token != word.** Assuming 1 token ≈ 1 word will break your context-length budget estimates. Use `tiktoken` or the provider's tokenizer to measure exactly.

## Top-1% insight

The context window is a first-class performance variable, not just a limit to avoid. Models attend to all tokens equally expensive at inference time. Pruning irrelevant history, compressing tool results, and summarising long conversations are **latency and cost optimisations** — not just workarounds. Production JARVIS agents that handle 20-tool loops must actively manage context or they'll hit rate limits and blow latency budgets mid-conversation.
