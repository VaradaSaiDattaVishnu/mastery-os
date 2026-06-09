Streaming is not a comfort feature — it cuts perceived latency by an order of magnitude and enables real-time voice synthesis; provider abstraction means that improvement is free to migrate between backends.

## The core

**Why streaming matters.** Without streaming, the user waits for the full response before seeing anything. With streaming, the first token arrives in ~200ms and speech synthesis can start in parallel with generation. Time-to-first-token (TTFT) is the latency metric that matters for voice, not total generation time.

**Server-Sent Events (SSE).** The HTTP transport for streaming is SSE: the server keeps the connection open and pushes `data: {...}\n\n` lines. Each chunk contains a delta — a partial token or a finish signal. The OpenAI-compatible API (which Groq implements) sends `choices[0].delta.content` per chunk and `finish_reason: "stop"` on the last one.

**Provider abstraction.** Groq and Anthropic have subtly different streaming APIs. An adapter pattern wraps each into a unified `stream(messages) → AsyncIterator<string>` interface. Switching models is then a config change, not a code change.

```typescript
// providers/types.ts
export interface LLMProvider {
  stream(messages: ChatMessage[]): AsyncIterable<string>
}

// providers/groq.ts
import Groq from "groq-sdk"

export class GroqProvider implements LLMProvider {
  private client = new Groq()
  async *stream(messages: ChatMessage[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      stream: true,
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  }
}

// providers/claude.ts
import Anthropic from "@anthropic-ai/sdk"

export class ClaudeProvider implements LLMProvider {
  private client = new Anthropic()
  async *stream(messages: ChatMessage[]): AsyncIterable<string> {
    const stream = await this.client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages,
      stream: true,
    })
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text
      }
    }
  }
}

// agent.ts — provider-agnostic consumer
async function respondWithVoice(provider: LLMProvider, userInput: string) {
  const messages = [{ role: "user" as const, content: userInput }]
  let sentence = ""
  for await (const token of provider.stream(messages)) {
    process.stdout.write(token)            // real-time display
    sentence += token
    if (/[.!?]/.test(token)) {            // sentence boundary
      await synthesiseSpeech(sentence)    // TTS while generation continues
      sentence = ""
    }
  }
}
```

## In your project

JARVIS switched from Groq (llama-3.3-70b) to Claude using exactly this adapter. The voice path pipes streaming tokens into a TTS buffer: sentence-boundary detection fires TTS synthesis before the full response is complete, achieving sub-500ms audio latency from the end of the user's speech input.

## Tradeoffs & pitfalls

- **Backpressure.** If TTS synthesis is slower than token generation, you need a queue, not a fire-and-forget await. Un-managed backpressure causes audio glitches or memory accumulation.
- **Tool calls don't stream content.** When `finish_reason == "tool_calls"`, delta content is empty — you get the tool call object only at the end of the stream. Design your voice UI to handle a silent gap during tool execution.
- **Error recovery mid-stream.** If the connection drops mid-stream, you only have a partial response. Track the accumulated text and decide whether to retry or surface a degraded response.
- **SSE vs WebSocket.** SSE is unidirectional and HTTP/1.1-compatible. For bidirectional voice (mic input + streamed output simultaneously), WebSockets are the correct transport.

## Top-1% insight

The real latency win in streaming voice comes from the **sentence-boundary trick**: don't wait for a complete response before starting TTS — start synthesising as soon as you have a complete sentence. This means the model is generating sentence N+1 while the speaker is voicing sentence N. On a fast GPU provider like Groq running llama-3.3-70b, tokens arrive fast enough that this pipeline keeps the audio queue continuously fed with near-zero gap between sentences — the system feels instantaneous even for 200-word answers.
