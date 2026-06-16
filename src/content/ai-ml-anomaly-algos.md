You already understand this — you just don't know the words yet. Everything below is built on one picture, and we add the interview vocabulary slowly, a layer at a time. Read it top to bottom; don't skip ahead.

## 1. The picture (start here)

Imagine every order your store has ever received is a **dot on a chart**. Orders that look alike land near each other, so normal orders pile up into a few dense **clouds**. A strange order — say **$9,000 at 3am from a customer who normally spends $40** — lands far out in the **empty space**, away from every cloud.

That's the whole idea of *anomaly detection*: a program that spots the dots sitting alone in the empty space. And the key part — **nobody ever told it which past orders were fraud.** It just learned where "normal" piles up and flags whatever sits far away.

## 2. The four tools — same question, different ways to ask it

All four answer one question: *"Is this dot a loner?"* Here they are, plainest first. You only need to know the first one cold — the other three are just so you can say "I considered alternatives."

- **Isolation Forest** (the one you used). Chop the chart with **random lines** until each dot is alone in its own little box. A loner in empty space gets boxed off in one or two cuts; a dot buried in a crowd needs many. **Few cuts to isolate = weird.** That's it.
- **Nearest neighbours (kNN).** Measure how far a dot is from its **closest few dots**. Far from everyone = weird.
- **Local Outlier Factor (LOF).** Like kNN, but fairer — it notices that some parts of the chart are naturally roomy and others packed, and judges each dot against **its local patch**. Good when "weird" means "weird for this little neighbourhood."
- **k-means.** Find the **centre** of each cloud, then measure how far a dot is from the **nearest centre**. Far from every centre = doesn't belong.

## 3. Now the interview answer — built one layer at a time

The question you'll get is *"Why did you choose Isolation Forest?"* Don't recite everything. Say **Layer 1**. Only add the next layer if they keep asking.

**Layer 1 — the one sentence (always start here):**
> "It learns what normal orders look like and flags the ones that don't fit — without needing labelled examples of fraud, which we don't have."

**Layer 2 — only if they ask "why not something else?":**
> "The alternatives all work by measuring distance between orders. My orders mix very different units — dollars, item counts, time of day — so distance-based methods need careful rescaling and have to keep every past order in memory to compare. Isolation Forest doesn't measure distance; it just splits the data randomly, so it's fast and doesn't care about units."

**Layer 3 — the line that impresses, if the conversation keeps going:**
> "Its known weakness is catching orders that are only weird for one specific user. I handled that in the features — I included things like 'how far is this order from this user's own average' — so a weird-for-you order already looks far-from-normal to the model."

Most interviewers stop at Layer 1 or 2. Layer 3 is your "I actually understand this" card — keep it in your back pocket.

## 4. The follow-up questions (plain answers to memorise)

**"How did you train it with no fraud labels?"**
> "I didn't need them. It learns the shape of *normal* from our real past orders. When the store is brand new and has too few orders, it starts on a batch of realistic fake-but-normal orders, then relearns from real ones as they arrive."

**"What did you feed the model?"**
> "Per-order facts plus per-user context: the amount, number of items, time of day, and how this order compares to that user's own history."

**"How do you know *why* an order got flagged?"**
> "For each flag, the model checks which facts mattered most — like 'the amount is far above this user's normal' — so a human sees a reason, not just a number."

## 5. One level deeper (optional — only if you're comfortable so far)

The model doesn't output "fraud / not fraud." It outputs a **score** between 0 and 1. Think of it as *"how much of a loner is this dot?"* Around **0.5** means "on the fence," higher means "more of a loner." The project flags anything above **0.6** — a deliberately cautious line. That's as much math as you need to hold a confident conversation. No formulas required.

## In one breath

> *"Every order is a dot; normal orders cluster, weird ones sit alone. Isolation Forest finds the lonely ones by seeing how few random cuts isolate them. I picked it because it needs no fraud labels, it's fast, and it doesn't care that my features are in different units."*

If you can say that out loud from memory, you can defend this in an interview.
