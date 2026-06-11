"It worked when I tried it" is the standard of evidence that ships broken AI. Probabilistic systems need a different discipline: probe the behavior end-to-end, attack your own claims adversarially, and re-verify after every change. Evals are unit tests for systems that don't promise the same output twice.

## The core

**Why normal testing isn't enough.** A deterministic function either passes or fails. An LLM turn can pass 9 times and fail the 10th — or pass with *this* phrasing and fail with a synonym. So you test at the level of **observable behavior**: did the right tool fire? did the answer cite the source? did the turn complete? — across enough varied probes to trust the distribution, not the anecdote.

**Level 1 — behavioral probes (cheap, run always).** JARVIS's rebuild was verified with end-to-end probes that assert on *events*, not exact text:

```js
// test client: send a message, record what actually happened
ws.send({ type:'message', text:'Set a reminder to call mom tomorrow at 5pm' });
// PASS = tool events fired AND a confirmation followed:
//   tools=[set_reminder:start, set_reminder:done]
//   text="I've set a reminder for you to call your mom tomorrow at 5 pm."
```

The probe set covered: a tool-triggering ask, a RAG question (asserting the *cited title*), capability honesty ("what can you do"), barge-in mid-stream, and an invalid input (`set_voice: "evil; rm -rf /"` → rejected). Five probes ≈ five product promises, checked in seconds.

**Level 2 — adversarial review (find what probes miss).** Probes confirm the happy path; the JARVIS hardening pass *attacked* the system: independent reviewers swept five dimensions (agent loop, server wiring, client contracts, UI, deploy), every claimed bug was then **re-verified against the code by a skeptic** before being accepted. Results: 18 claims → 15 confirmed real → 3 rejected as false positives. Among the real ones:

- The Claude agent path could end a turn **silently** (tool budget exhausted, no closing call — the Groq path had the safety net, Claude's didn't).
- The Twilio webhook guard **failed open** when `PUBLIC_URL` was unset — unsigned requests would have reached the LLM and memory.
- Recovered tool calls with Python-literal args parsed to `{}` and executed as no-ops.

None of these appear in a demo. All of them appear in week two of real usage.

**The verify-the-claim discipline.** The single most transferable habit: *a reported bug is a hypothesis, not a fact.* Each finding was checked by re-reading the actual code path before any fix — which is what filtered the 3 plausible-but-wrong claims and prevented "fixes" to healthy code.

**Level 3 — regression by re-probe.** After the 15 fixes: re-run syntax checks, rebuild, re-run the probe set, then re-verify the originally-failing behavior (the live production probe: upload doc → ask → cited answer). Fix → re-probe is the loop; a fix without a re-probe is a hope.

## In your project

The full ladder, as actually run on JARVIS: WS behavioral probes (tool firing, RAG citation, barge-in, allowlist rejection) → five-dimension adversarial sweep with per-finding skeptical verification (15/18 confirmed, all fixed) → post-fix re-probe locally → post-deploy re-probe against production (`wss://…railway.app`), including the end-to-end voice RAG answer with the real uploaded document.

## Tradeoffs & pitfalls

- **Asserting exact text** makes evals flaky (every model update breaks them). Assert *events and properties*: which tool, did it cite, did it complete, was it grounded.
- **Self-evaluation bias.** The same prompt that wrote the code will defend the code. Adversarial review works because the reviewer's instruction is to *refute*, and acceptance requires evidence from the code itself.
- **Eval rot.** Probes that nobody runs after each change are documentation, not tests. Wire them to deploys.
- **One probe per promise.** If the product claims "cited answers from your documents", there must exist a probe that uploads a document and checks the citation. Unprobed promises are marketing.

## Top-1% insight

The 18→15→3 funnel is the insight: even a strong reviewer is only ~85% precise, and the *verification layer* — a skeptic instructed to disprove each claim against the actual code — is what makes review output safe to act on. This generalizes to every AI-assisted workflow: generation (of code, bugs, answers) is cheap and noisy; **independent verification is the quality gate**, and it's worth a dedicated step with an adversarial instruction. Teams that act on unverified findings ship fixes to imaginary bugs; teams that verify first get the 15 real ones and skip the 3 wild geese.

## Feynman check

Explain: (1) why "assert events, not text" makes evals survive model updates; (2) why the fail-open Twilio bug could never appear in a demo; (3) the 18→15→3 funnel — what does the skeptic layer actually buy?
