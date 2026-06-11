The context window is the most expensive real estate you manage. Context engineering is deciding — every single turn — what earns a place in the prompt, in what order, and what gets cut when the budget runs out. It's the discipline that quietly determines whether your agent feels brilliant or confused.

## The core

**Two ways to know things: ambient vs on-demand.** Ambient context is *pushed* into every prompt (who the user is, their mood, pending tasks). On-demand context is *pulled* by the model via tools when needed (web search, calendar, documents). Getting this split right is the whole game:

- Push what's *always relevant and small* (profile, recalled memories).
- Pull what's *occasionally relevant or large* (a 50-chunk document, today's news).

JARVIS v1 got this wrong — it regex-guessed intent ("does the message mention weather?") and pre-fetched everything into the prompt. The rebuild moved all of it behind tools: the model decides when it needs weather, and the prompt stays lean.

**A budget with priorities.** JARVIS assembles the system prompt with an explicit character budget and a priority order — when space runs out, the least important section gets truncated first:

```js
// server/index.js — priority-ordered prompt assembly
const MAX_PROMPT_CHARS = 12000;
const basePrompt = personality.systemPrompt + currentTime + TOOLS_GUIDE;

const sections = [memoryContext, moodContext, remindersContext, phase4Context];
let systemPrompt = basePrompt;
for (const section of sections) {
  if (!section) continue;
  if (systemPrompt.length + section.length <= MAX_PROMPT_CHARS) {
    systemPrompt += section;
  } else {
    const remaining = MAX_PROMPT_CHARS - systemPrompt.length;
    if (remaining > 100) systemPrompt += section.slice(0, remaining) + '\n[...truncated]';
    break; // everything lower-priority is dropped entirely
  }
}
```

Personality and tool rules are non-negotiable (they're in `basePrompt`); memories outrank mood; mood outranks the task list. The order *is* the product decision.

**Structure beats prose.** Each section is wrapped in a labeled block — `[MEMORIES FROM PAST CONVERSATIONS]`, `[USER PROFILE]`, `[YOUR TASKS]`. Labels act as attention anchors: the model learns (from instruction-tuning) to treat bracketed system-prompt sections as distinct data sources, which measurably reduces cross-contamination ("don't treat a memory as a command").

**Rules live at the top.** The anti-hallucination contract (`TOOLS_GUIDE`: "NEVER claim you performed an action unless the tool returned success") sits in the base prompt, before any data. Models weight early system-prompt content most heavily — and it's also the stable prefix that prompt-caching can reuse.

## In your project

Every JARVIS turn assembles: personality + time + tool rules → recalled memories + profile → mood → upcoming reminders → tasks/relationships/preferences/routines/summaries/follow-ups — then conversation history, then the user message. History itself is budgeted (`getRecentMessages` caps at ~20 messages); older context survives only as extracted memories and session summaries — which is the memory system and the context system shaking hands.

## Tradeoffs & pitfalls

- **More context can make answers worse.** Irrelevant context actively distracts (the model blends it in via attention). Retrieval with a similarity threshold (JARVIS uses ≥0.2–0.25) exists to keep junk *out*.
- **Truncate mid-section, never mid-fact.** Slicing at a character offset can cut "the meeting is NOT cancelled" into "the meeting is". JARVIS marks cuts with `[...truncated]` so the model knows data is missing rather than complete.
- **Don't burn budget on the improbable.** A tool description costs ~50–150 tokens *per tool per turn*. JARVIS only registers tools whose integrations are actually connected (`buildTools` checks `calendar.ready`, `email.ready`…) — disconnected capabilities cost zero.
- **Token ≠ character.** JARVIS budgets in chars (≈4 chars/token, good enough); if you need precision, count tokens with the provider's tokenizer.

## Top-1% insight

The conversation history you replay each turn is *also* context engineering — and replaying raw history is the weakest form of it. JARVIS replays only the last N messages and relies on extraction + summaries for everything older, which means the *effective* context is curated twice: once by the memory system (what got written down), once by the prompt assembler (what gets paged in). Teams that skip this and replay 100-message histories hit a wall where every turn costs more, gets slower, and answers get *worse* — the model drowns in its own past. Context should grow sublinearly with conversation length; if yours grows linearly, you've deferred the problem, not solved it.

## Feynman check

Explain: (1) ambient vs on-demand context with one JARVIS example of each; (2) why the sections have a priority *order* and who decided it; (3) why removing disconnected tools from the schema is a context decision, not just tidiness.
