In the AI era, "did you build it?" is the wrong question. The value test is different: **can you defend it?**

## The core

A project is *yours* if you can do four things on demand:

1. **Explain the architecture** — the components, how data flows, where the boundaries are, and what each piece is responsible for.
2. **Justify three design decisions** — not "I used X," but "I chose X over Y because Z, and here's the tradeoff I accepted."
3. **Describe the hardest bug you hit** — what broke, how you found it, the root cause, and the fix.
4. **Say what you'd change** — where it bends at 100× scale, what you'd refactor, what you now know you got wrong.

If you can do that, it does not matter that AI wrote 70% of the keystrokes — **you were the engineer.** If you can't, the project is a *liability* even if you typed every character, because product-company interviews don't ask "did you build it?" They probe:

> "Why RabbitMQ **topic** exchanges instead of **direct**?"
> "Why **Isolation Forest** over a supervised model?"
> "Walk me through your **chunking** strategy."

Hollow answers there are how offers die. A confident, specific, tradeoff-aware answer is how they're won.

## The defense structure (use it for every answer)

When an interviewer points at any piece of your system, answer in this order — it reads as senior every time:

```
1. What it does        — one sentence, the responsibility.
2. Why this approach    — the decision.
3. The alternative      — what you rejected ("I could have used direct
                          exchanges / a supervised model / a bigger chunk").
4. The tradeoff          — what that choice costs ("topic adds routing-key
                          discipline, but lets new consumers subscribe without
                          touching the producer").
5. The failure mode      — where it breaks, and how you handle it.
```

Notice step 3 is the one juniors skip. **Naming the alternative you rejected — and why — is the single highest-signal move in a technical interview.** It proves you saw the fork in the road and chose deliberately.

## How to use this track

Each lesson below is a **defense kit** for one of your projects, built from its *actual code* — the real architecture, the real decisions, the genuine risk surface, and the exact probing questions an interviewer will ask, each with a strong, code-grounded model answer.

Work each one until you can close the lesson and **say the answers out loud from memory.** Then open the **✦ AI Tutor** and hit **Mock interview** — it will probe you the way a real panel does, in this exact topic. Reading the answer is recognition; saying it cold is recall. Only recall survives the room.

## Top-1% insight

The engineers who clear senior bars treat every "why" as an invitation to show judgment, not knowledge. Anyone can recite what RabbitMQ is. The 1% answer is: *"I used a topic exchange because I needed multiple independent consumers — inventory, analytics, the anomaly scorer — to subscribe to `order.created` without the producer knowing they exist. A direct exchange would have coupled the producer to every consumer's routing key; fanout would have over-delivered. Topic gave me selective, decoupled subscription. The cost is routing-key discipline — get the key taxonomy wrong and debugging delivery is miserable."* Same fact. Completely different league.
