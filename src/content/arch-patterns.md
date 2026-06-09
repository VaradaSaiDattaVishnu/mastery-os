Design patterns are names for recurring structural shapes — not magic, but a shared vocabulary that makes intent legible. Strategy, adapter, observer, and factory solve real coupling problems that appear in every non-trivial codebase, including yours.

## The core

**Strategy** — extract an algorithm behind an interface so callers don't know which variant runs. The calling code depends on the abstraction, not the concrete implementation. Classic SOLID: Open/Closed (add a new strategy without touching existing code) plus Dependency Inversion (depend on the interface, inject the concrete).

**Adapter** — translate one interface into another without changing either side. This is the seam between your domain logic and a third-party library. If the library changes its API, only the adapter changes.

**Observer** — a subject maintains a list of listeners and notifies them on state change. Node's `EventEmitter` is observer. React context propagation is observer. The risk: listeners are invisible callers that hold references and can leak memory.

**Factory** — centralise construction logic so the caller never does `new ConcreteClass()` directly. It enables substitution at the creation site without scattering `if/switch` blocks.

```ts
// JARVIS: provider abstraction via Strategy + Adapter
interface LLMProvider {
  chat(messages: Message[]): AsyncIterable<string>
  embed(text: string): Promise<number[]>
}

class GroqAdapter implements LLMProvider {
  constructor(private readonly client: Groq) {}

  async *chat(messages: Message[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: 'llama3-70b-8192',
      messages,
      stream: true,
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  }

  async embed(text: string): Promise<number[]> {
    // Groq doesn't do embeddings — throw or delegate
    throw new Error('GroqAdapter: embeddings not supported')
  }
}

class ClaudeAdapter implements LLMProvider {
  constructor(private readonly client: Anthropic) {}

  async *chat(messages: Message[]): AsyncIterable<string> {
    const stream = await this.client.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages,
    })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    // delegate to a separate embedding provider
    return embedWithMiniLM(text)
  }
}

// Factory: pick provider from config, never from call sites
function createProvider(cfg: Config): LLMProvider {
  switch (cfg.provider) {
    case 'groq':    return new GroqAdapter(new Groq({ apiKey: cfg.apiKey }))
    case 'claude':  return new ClaudeAdapter(new Anthropic({ apiKey: cfg.apiKey }))
    default:        throw new Error(`Unknown provider: ${cfg.provider}`)
  }
}
```

## In your project

JARVIS talks to both Groq and Claude. Without the adapter pattern, every tool-calling loop has `if (provider === 'groq')` branches scattered everywhere. With it, `AgentRuntime` depends only on `LLMProvider` — swapping Groq for Claude is a one-line config change, not a refactor. The factory in `createProvider` means no call site ever imports `Groq` or `Anthropic` directly.

## Tradeoffs & pitfalls

**Premature abstraction is the real risk.** Building the `LLMProvider` interface before you have two providers is speculation. The pattern earns its complexity only when variation actually exists. Similarly, a factory for a class you'll only ever instantiate one way adds indirection with zero benefit.

**Adapter hiding contract mismatches.** Adapting an interface that is fundamentally incompatible (e.g., synchronous vs async, different error models) produces a leaky adapter — you end up with error-handling logic inside the adapter that should belong to the domain. Prefer thin adapters.

**Observer memory leaks.** If a listener holds a reference to a component or closure and is never removed, the subject keeps the listener alive forever. Always implement `removeListener` / `unsubscribe` and call it on cleanup.

## Top-1% insight

The SOLID principle that actually matters here is the **Dependency Inversion Principle** at the module level, not just the class level. In TypeScript, you enforce it by having your core business logic import from an `interfaces/` or `ports/` module that contains only type declarations — no imports from `groq-sdk` or `@anthropic-ai/sdk`. The adapters live in an `infrastructure/` layer that imports both the interface and the SDK. This means you can compile and test the entire domain logic without network access or API keys, because the domain has zero knowledge that a network even exists.
