Demo agents assume the model behaves. Production agents assume it won't — and build a cage of recovery paths, fallbacks, and validation around every model output. This lesson is the true story of making JARVIS's agent loop survive a model that kept breaking the rules.

## The core

**War story: the tool call that 400'd.** JARVIS on Groq/Llama worked in isolated tests, then failed in production with `400 tool_use_failed`. The cause: instead of using the native tool-call channel, Llama sometimes *writes the tool call as text* in a "functionary" format — and Groq's own parser rejects the generation:

```text
failed_generation: <function=set_reminder{"content": "call mom", "when": "tomorrow at 5pm"}</function>
```

The model's *intent* was perfect. The *packaging* was broken. Naive handling (catch → "Something went wrong") throws away a correct answer. JARVIS instead **recovers the intent from the error**:

```js
// server/llm.js — recover Llama's text-format tool calls that Groq rejected
if (useTools && isToolUseFailed(error)) return recoverFromToolFailure(error, iter);

function parseLlamaToolCalls(text) {
  // find <function=name ...{ then BALANCE BRACES (regex-to-last-} over-captures
  // when prose follows; nested JSON breaks lazy matching)
  const re = /<function=([a-zA-Z0-9_]+)>?\s*\{/g;
  // ... extractBalancedJson() walks the string counting { } depth, quote-aware
}

function coerceToJsonString(raw) {
  // Llama emits Python literals: {'action': 'turn_on', 'metric': True}
  try { JSON.parse(raw); return raw; } catch { /* repair */ }
  const repaired = raw.replace(/\bTrue\b/g,'true').replace(/\bFalse\b/g,'false')
                      .replace(/\bNone\b/g,'null').replace(/'/g,'"');
  try { JSON.parse(repaired); return repaired; } catch { return null; }
}
```

Three independent failure modes, three layers: extract the call from the error payload → balance braces (not regex-greedy) → coerce Python-style literals to JSON. Calls that still don't parse are *dropped*, not executed with `{}` — a wrong action is worse than no action.

**Validate before executing.** The model can emit a syntactically valid call with missing arguments. JARVIS's dispatcher checks the tool's own JSON-Schema `required` list and returns a *correctable* error to the model — which sees it as a tool result and retries properly:

```js
// server/tools.js — execute()
const missing = required.filter(k => args[k] === undefined || args[k] === null || args[k] === '');
if (missing.length) return `Cannot run ${name}: missing required argument(s): ${missing.join(', ')}.`;
```

**Always end with words.** An agent loop can spend its whole iteration budget (MAX_ITERS = 6) on tool calls and never produce prose — the user hears silence. Both providers get a *safety net*: one final, tools-disabled call that forces a spoken answer ("Sorry, I ran out of steps on that…" as the deterministic floor).

**Degrade, don't die.** Rate-limited (429)? Retry on the smaller/faster model — and apply the *same* tool-failure recovery there, because the small model misbehaves *more*, not less. Model down? The error message the user hears is specific ("Invalid Groq API key…") only when it's actionable.

## In your project

`server/llm.js` is the cage: streaming agent loop for Claude, non-streaming for Groq (streaming + tools is unreliable there — a deliberate reliability-over-latency trade), recovery shim, 429 fallback chain (70B → 8B), abort-signal checks at every await, and per-iteration tool budgets. `tools.js` adds schema validation; `index.js` adds the AbortController plumbing so a barge-in can kill a turn mid-tool.

## Tradeoffs & pitfalls

- **Silent empty-input execution.** `JSON.parse` fails → `catch { input = {} }` → the tool runs with nothing → "Unknown action: undefined". The fix is *refusing* unparseable calls, not defaulting them.
- **Retrying the identical request** on a 400 is a loop, not a fix — 400s are deterministic. Recover or rephrase; only retry 429/5xx.
- **Error messages are prompts.** Whatever your tool returns on failure is *read by the model*. "Error 37" teaches it nothing; "missing required argument: entity_id" teaches it exactly what to fix.
- **Caps everywhere.** Iteration caps, token caps, timeout caps. Any uncapped loop around a paid API is a billing incident waiting for a confused model.

## Top-1% insight

The deepest pattern here: **treat the model as an unreliable network peer, and treat its failures as data.** A malformed tool call is not an exception — it's a *message in a degraded encoding*, and you can often decode it. Teams that wrap model calls in generic try/catch lose 10–20% of perfectly good turns on open-weight models; teams that parse `failed_generation` payloads recover almost all of them. The reliability ladder is: validate → recover → degrade → fail loud, in that order — and the same ladder applies to every probabilistic component you'll ever ship.

## Feynman check

Explain: (1) why regex-to-the-last-`}` over-captures and what brace-balancing does differently; (2) why a missing-argument error is *returned to the model* instead of thrown; (3) why the final safety-net call has tools disabled.
