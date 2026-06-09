Good design sometimes makes the user slower on purpose — restraint is a feature, not a failure.

## The core

Most UX is built on engagement metrics: sessions, streaks, time-on-app. That incentive structure quietly produces dark patterns — variable-reward notifications, artificial urgency, loss aversion exploited through streak counts. These patterns are not bugs; they are the logical output of optimizing for retention over wellbeing.

Trauma-informed design inverts this. It starts from a clinical observation: for people processing difficult material (grief, addiction, illness, past trauma), fast progress is a warning sign, not a success. A user who burns through five sessions in one night may be dissociating, not thriving. The UI should notice that and create friction — a gentle gate, a pause prompt, an explicit stop control always within reach.

Ethical design principles at their root are research findings, not moral preferences. Self-determination theory shows that autonomy and competence matter more than reward for long-term intrinsic motivation. Behavioral economics shows that variable rewards create compulsion, not commitment. Designing with these forces rather than against users means your product earns trust and sustains behavior longer — the better metric by far.

Do / Don't:

```
DO                                     DON'T
--------------------------             --------------------------
Always-visible Stop / Pause control   Hide exit behind confirmation hell
"You've gone deep today. Rest?"        "5-day streak — don't break it!"
Session pacing based on content       Autoplay next lesson immediately
Progress shown as understanding        Progress shown as badges earned
Consent before sensitive content       Assume content is universally safe
```

## In your project

Tapasya has no streaks, no badges, no gamification layer. That deliberate absence is the product decision. Fast progress surfaces a cooldown prompt; the Stop control is in the primary navigation, not buried. Every session-length decision defers to pacing psychology rather than DAU targets.

## Tradeoffs & pitfalls

The business pressure is real: DAU and retention are how apps get funded. Choosing ethical constraints means accepting that some engagement metrics will look worse. The counter-argument — and it is empirically supported — is that trust-based products have dramatically higher long-term retention and far better word-of-mouth. Trauma-informed design also requires content warnings done correctly: vague warnings ("sensitive content") are almost useless; specific, scoped warnings ("this section discusses self-harm") allow genuine informed consent.

## Top-1% insight

The most insidious dark pattern is not the fake countdown timer or the misleading unsubscribe flow — it is the default. What happens when the user does nothing? Autoplay, push notifications enabled, data collection on — these defaults exploit inertia, which is as coercive as any explicit manipulation. Senior product engineers audit defaults with the same rigor they audit explicit interactions. In tapasya's context: the default after a session ends is silence, not the next lesson queuing up.
