A voice assistant is a relay race: speech → text → thinking → text → speech. Each leg adds latency, and the human on the other end starts feeling "laggy" past about one second. Voice AI engineering is mostly the art of overlapping the legs so nobody waits for a baton.

## The core

**The pipeline.** ASR (speech-to-text) → agent/LLM → TTS (text-to-speech). JARVIS's split: ASR in the *browser* (Web Speech API — free, instant, on-device), agent on the server, TTS via edge-tts neural voices, audio streamed back as files the client queues and plays.

**The cardinal rule: never wait for the whole answer.** A 15-second spoken reply, synthesized only when the LLM finishes, means 15 seconds of silence. JARVIS splits the LLM's *token stream* at natural speech boundaries and synthesizes each piece while the model is still writing the next:

```js
// server/tts.js — split mid-stream, not at the end
const SENTENCE_END = /[.!?;]\s|[.!?]$/;
const CLAUSE_SPLIT = /[,\-:—]\s/;
const MIN_CLAUSE_LENGTH = 30;

function shouldSplitForTTS(buffer) {
  if (SENTENCE_END.test(buffer)) return 'sentence';
  if (buffer.length >= MIN_CLAUSE_LENGTH && CLAUSE_SPLIT.test(buffer)) return 'clause';
  return null;
}
```

Clause-level splitting (commas, dashes) starts audio 40–60% sooner than waiting for a full sentence. The first spoken syllable lands while the model is mid-paragraph — *perceived* latency collapses even though total compute is unchanged.

**Ordering without blocking.** Chunks synthesize concurrently and finish out of order; each is tagged with an index, and the client holds a `Map<index, url>`, playing strictly in sequence: play n, check for n+1, wait if it hasn't arrived. Classic stream reassembly — same algorithm as TCP, applied to sentences.

**Barge-in: the interrupt path.** Humans interrupt; assistants must die mid-sentence gracefully. JARVIS threads one `AbortController` through the entire turn — LLM stream, tool calls, TTS sends all check it:

```js
// server/index.js — one turn, one controller
const myController = new AbortController();
abortController = myController;            // visible to the interrupt handler
// ... agentStream(system, msgs, tools, execute, myController.signal)
} finally {
  // Only the OWNING turn clears shared state — a stale abort must not
  // stomp a newly started turn (identity check, not a boolean).
  if (abortController === myController) { isProcessing = false; abortController = null; }
}
```

On interrupt: abort fires → stream loop exits → partial response is saved with `[interrupted by user]` → client stops audio and clears its queue. The identity-guarded `finally` is the subtle part — without it, an interrupt arriving during turn-teardown can unlock a turn that already restarted.

**Echo control.** The mic must not hear the assistant. JARVIS pauses speech recognition while TTS audio plays (`isSpeaking` gate) and resumes after — otherwise the assistant transcribes itself and replies to its own reply, forever.

## In your project

The full loop: browser Web Speech (with a "JARVIS" wake-word mode) → WebSocket → agent loop streaming `text` events → clause splitter → edge-tts (a free neural TTS driven via Python) → `/audio/*.mp3` URLs → indexed client-side audio queue → Esc/voice barge-in → AbortController teardown. Latency budget achieved: first audio typically under ~1.5s on Groq.

## Tradeoffs & pitfalls

- **Too-small chunks sound robotic.** Splitting every 5 words gives fast-but-choppy prosody. JARVIS's `MIN_CLAUSE_LENGTH = 30` chars is the floor below which it won't split.
- **Out-of-order playback** is the classic bug: chunk 2 finishes synthesis before chunk 1 and plays first. Index everything; play by sequence, not arrival.
- **The cursor-reset bug (real, shipped, fixed).** JARVIS's client reset its play-index only on a `thinking` event; one server path sent audio without it — index mismatch, silent assistant. Every stream consumer needs an explicit "new response starts now" reset signal.
- **TTS processes leak.** Each synthesis spawns a process with a timeout; double-settle guards (resolve once, clear timer) prevent zombie processes under load.

## Top-1% insight

Latency engineering here is *perceptual*, not computational. Total processing time barely changed when JARVIS moved from sentence-level to clause-level splitting — but time-to-first-syllable halved, and users describe the same total wait as "instant". The general law: humans judge responsiveness by *time to first sign of progress*, not time to completion. Stream the first thing you can defensibly produce — a clause, a typing indicator, a tool-status chip ("Searching your documents…") — and you buy seconds of patience for free. JARVIS's tool chips exist for exactly this reason.

## Feynman check

Explain: (1) why clause-splitting cuts *perceived* latency but not total compute; (2) the out-of-order chunk problem and the Map-by-index fix; (3) why the `finally` checks `abortController === myController` instead of just nulling it.
