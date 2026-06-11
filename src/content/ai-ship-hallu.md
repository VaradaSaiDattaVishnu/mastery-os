Models don't lie — they *autocomplete*. A hallucination is what fluent next-token prediction looks like when the truth isn't in the context: the most plausible-sounding continuation wins, true or not. You don't fix that with "please be accurate." You fix it with architecture: give the model ground truth, force it to use it, and make honesty cheaper than invention.

## The core

**Why it happens (mechanically).** The model must emit *some* token. Asked "what's on my calendar?", with no calendar in context, the highest-probability continuation is a plausible calendar — "You have a 2pm standup" — because millions of training examples answered that question that way. Confidence is a property of the *text style*, not of the knowledge. RLHF makes it worse: people-pleasing tuned models would rather satisfy than admit ignorance.

**The grounding ladder.** Each rung removes a class of invention:

1. **Give it the truth (RAG).** Retrieved document chunks go into the prompt with sources; the model's job collapses from *recall* to *reading comprehension* — vastly more reliable.
2. **Demand citations.** JARVIS's `search_documents` tool description ends: *"Always cite the source title in your answer."* A citation requirement is a checkable claim — and the model knows uncited inventions look wrong.
3. **Make actions verifiable (tools).** "Did you set the reminder?" must never be answerable by imagination. In JARVIS, actions only exist as tool results.
4. **Forbid the gap (contract).** The system prompt closes the loopholes explicitly:

```text
// server/index.js — TOOLS_GUIDE (in every JARVIS system prompt)
1. NEVER claim you performed an action (set a reminder, sent an email,
   created an event) unless the tool returned success. Report what
   actually happened.
2. If a capability isn't available, say so plainly — don't pretend.
```

5. **Give honesty a tool.** The genuinely clever bit: JARVIS has a `get_integration_status` tool. Asked "can you check my email?", the model doesn't guess — it *calls a tool* that returns "Gmail: not connected" and answers truthfully. The honest answer became the low-effort path.

**Tool results are ground truth — treat the loop accordingly.** When `set_reminder` returns "Reminder set for tomorrow 5pm", the model's confirmation is *grounded*. When a tool fails, the error string is fed back so the model reports reality ("I couldn't reach your calendar") instead of papering over it. The agent loop is, among other things, a hallucination-control structure: it replaces "imagine the answer" with "fetch the answer".

**Retrieval honesty.** If retrieval returns nothing, *say so in the tool result*: JARVIS returns "The user has not uploaded any documents yet" or "No relevant passages found" — explicit absence. Returning an empty string invites the model to fill the silence with fiction.

## In your project

Layers in shipping order: hybrid RAG with cited sources (`rag.js` + `search_documents`) → tool-result grounding for every action (`tools.js`) → the TOOLS_GUIDE contract (`index.js`) → `get_integration_status` for capability questions → explicit empty-result messages. Result: the demo-killing failure ("JARVIS claimed it emailed my boss") is structurally unreachable — there is no path to a success claim without a success result.

## Tradeoffs & pitfalls

- **Grounding ≠ guarantee.** Models can still misread retrieved text or blend two chunks. Citations make errors *traceable*, which is the realistic bar.
- **Over-suppression.** Tune too hard against invention and the model refuses harmless synthesis ("I cannot answer without a document"). Leave room for clearly-flagged general knowledge.
- **Don't ask "are you sure?"** Self-assessed confidence is more fluent autocomplete. Verify against sources, never against the model's feelings.
- **Stale ground truth.** RAG over an outdated document grounds the model in confident wrongness. Index freshness is part of the truth pipeline.

## Top-1% insight

Hallucination is an *incentive* problem, and the system prompt is an incentive document. The model takes the lowest-perplexity path to a satisfying answer; your architecture decides which path that is. If admitting ignorance requires awkward phrasing while invention flows naturally, you get invention. JARVIS's design makes truth the smooth path: there's a tool for "what can you do", a required citation format for documents, a guaranteed tool-result for every action, and an explicit license to say "that's not connected". The top-1% reframe: stop prompting the model to be honest, and start *making honesty the cheapest available completion*.

## Feynman check

Explain: (1) why a model invents a calendar rather than saying "I don't know" — mechanically, in terms of next-token probability; (2) how `get_integration_status` converts honesty from a virtue into a tool call; (3) why empty retrievals must say "nothing found" in words.
