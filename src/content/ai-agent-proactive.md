A reactive assistant answers questions. A proactive one notices things: "your interview is Thursday and you haven't prepped", "you asked about that rash three days ago — how is it?". The mechanism is almost embarrassingly simple — *schedule the model to read the user's state and ask itself what a thoughtful human would bring up* — but the design constraints (grounding, timing, restraint) are where it gets real.

## The core

**The inversion.** Everything else in an agent runs *user → model*. Proactive flips it: a **trigger** (cron schedule, inactivity timer, due timestamp) runs *system → model → user*. No new ML — the same LLM, pointed at stored context instead of a live question.

**Pattern 1 — the anticipatory digest.** On demand (JARVIS's Dashboard) the system gathers state and asks for suggestions, with hard grounding rules:

```js
// server/briefing.js — generateProactiveInsights()
const ctx = [pendingTasks, upcomingCalendar, openFollowUps, recentSummaries];

const raw = await this.llm.chat(
  `You are JARVIS's proactive engine. Given the user's current context, suggest
   2-3 genuinely useful, anticipatory actions — things a thoughtful assistant
   would notice. Be specific and grounded ONLY in the context provided; never
   invent events or tasks.
   Return ONLY a JSON array: {"title","detail","priority"}.
   If nothing is genuinely worth surfacing, return [].`,
  [{ role: 'user', content: `Current time: ${now}\n\n${ctx.join('\n\n')}` }],
  { useMainModel: true }
);
```

Note the three load-bearing phrases: *grounded ONLY in the context provided* (anti-hallucination), *return []* (permission to stay silent — without it the model invents filler to be helpful), and strict JSON (machine-renderable).

**Pattern 2 — detected follow-ups.** After each conversation, a cheap background model call asks: "does this exchange contain something worth checking on later?" (interviews, health worries, pending decisions). Hits are stored with a `check_after` timestamp; a 30-minute sweep delivers due ones — over WebSocket if the user is online, push notification if not.

**Pattern 3 — scheduled briefings & nudges.** Morning briefing at 08:00 (calendar + weather + tasks + follow-ups, composed by the LLM into 150 natural words); a nudge if the user's been gone 24h. Both respect **quiet hours** — proactive messages at 3am teach users to kill notifications permanently.

**Delivery is half the feature.** JARVIS's follow-up sweep tracks delivery state: sent over WS → wait for the client's explicit ack (`POST /api/followups/:id/done`); no ack within a grace window → fall back to push and mark done. Without ack-tracking, one undelivered follow-up re-fires every sweep forever — the bug class that turns "thoughtful" into "spam".

## In your project

Feature 3 of JARVIS is exactly this trio: `briefing.js` (digest + morning briefing), `followup.js` (detection, sweeps, quiet hours, ack-grace), and the Dashboard's *Proactive Intelligence* panel calling `/api/proactive/suggestions`. All of it runs on the same two models as chat — proactivity cost ≈ a handful of extra cheap calls per day.

## Tradeoffs & pitfalls

- **The empty array is the most important output.** A proactive system that always says something trains users to ignore it. Measure your silence rate; healthy is *mostly silent*.
- **Ground or hallucinate.** Given freedom, the model will invent a "meeting with Sarah" to be useful. Feed it only real rows and forbid invention explicitly.
- **Interruption budget.** Cap proactive messages per day, dedupe topics (don't follow up twice on the same thing), respect quiet hours — JARVIS encodes all three.
- **Proactive ≠ autonomous.** JARVIS *suggests* ("you might want to…"); it doesn't *act* unprompted (send emails, move money). Autonomy without explicit user delegation is how assistants get uninstalled.

## Top-1% insight

The hard part of proactive AI isn't generation — it's *state machines around delivery*. "Suggest something" is one LLM call; "make sure exactly one copy reaches the user, on the right channel, at an acceptable hour, and never re-fires after acknowledgment" is a distributed-systems problem (at-least-once delivery + idempotency + TTL fallback). JARVIS's delivered-map + ack endpoint + grace-window-push is a miniature outbox pattern. Engineers who treat proactive features as "cron + prompt" ship notification storms; engineers who treat them as delivery systems ship features people keep enabled.

## Feynman check

Explain: (1) the trigger inversion — what replaces the user's message; (2) why "return [] if nothing is worth surfacing" changes the model's behavior; (3) why the follow-up sweep needs an ack + grace window instead of marking done on send.
