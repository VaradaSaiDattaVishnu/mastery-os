People don't just say things — they feel things while saying them. Affective computing is the loop that notices ("user sounds stressed"), adapts ("respond calmly, slower voice"), and remembers ("they've been anxious all week"). JARVIS closes this loop with one cheap LLM call and a prosody map.

## The core

**Detection: the LLM is the classifier.** Pre-LLM sentiment analysis meant training a dedicated model. Now a background call does it better, with nuance and a structured contract:

```js
// server/mood.js — after each user message (background, fast model)
// prompt: classify mood + intensity + triggers, return STRICT JSON
// → { "mood": "stressed", "intensity": 0.7, "triggers": "deadline tomorrow" }
this.memory.db: mood_log(session_id, mood, intensity, triggers, timestamp)
```

Every reading is *logged, not just used* — mood becomes time-series data ("anxious 3 days running"), which feeds back into the system prompt as context (`getMoodContext`) so the *words* adapt too.

**Adaptation: emotion → physics of the voice.** Text-to-speech has two cheap, powerful knobs — speaking rate and pitch. JARVIS maps detected user mood to assistant vocal posture:

```js
// server/tts.js — emotion → prosody
const EMOTION_PARAMS = {
  excited:    { rate: '+15%', pitch: '+8Hz' },
  happy:      { rate: '+10%', pitch: '+5Hz' },
  empathetic: { rate: '-10%', pitch: '-3Hz' },
  sad:        { rate: '-15%', pitch: '-5Hz' },
  calm:       { rate: '-5%',  pitch: '-2Hz' },
  neutral:    { rate: '+5%',  pitch: '+0Hz' },
};

// server/index.js — the mapping is asymmetric ON PURPOSE:
const moodToEmotion = {
  happy: 'happy', excited: 'excited',     // mirror positive moods
  sad: 'empathetic', anxious: 'calm',
  stressed: 'calm', angry: 'calm',        // COUNTER negative ones
};
```

Read that second map carefully — it encodes an emotional-intelligence rule: *mirror joy, counter distress*. An assistant that matches your anger escalates; one that meets it calmly de-escalates. One small object literal, but it's the difference between "responsive" and "emotionally competent".

**Who's speaking: voice biometrics.** JARVIS's speaker-ID (`speaker.js`) enrolls voices as **MFCC** feature vectors — Mel-Frequency Cepstral Coefficients, a compact fingerprint of vocal-tract shape (the same features classic speech systems used for decades). Identification is nearest-neighbor over stored embeddings: same cosine-similarity pattern as text memory, applied to audio.

**What language: script detection → voice switching.** `detectLanguage()` checks Unicode ranges (Devanagari → Hindi, Telugu, CJK…) and common-word heuristics for Latin-script languages, then swaps the TTS voice automatically — reply in Telugu, get a Telugu neural voice, zero configuration.

## In your project

The full affect loop per turn: user message → background mood classification (cheap model, strict JSON) → mood logged + summarized into prompt context → `tts.setEmotion()` adjusts rate/pitch before the next synthesis → response text *and* response sound both adapt. Cost: one extra fast-model call and an object lookup.

## Tradeoffs & pitfalls

- **Affect detection from text is noisy.** Sarcasm, cultural style, and brevity all confuse it. Use intensity thresholds, decay old readings, and never act irreversibly on a mood guess.
- **Subtlety is the entire game.** ±15% rate is felt but not noticed; ±50% is a cartoon. If users can *name* what changed, you overdid it.
- **Don't announce it.** "I sense you're upset" is creepy validation-bait. Adapt silently; let the user feel heard without being told they were scanned.
- **Affect data is sensitive data.** A mood time-series is health-adjacent. JARVIS keeps it in the same encrypted local store as memories, governed by the same privacy commands ("forget that", off-the-record).

## Top-1% insight

The affect loop's real power is *closing through memory*, not the per-turn tweak. A single calm-voiced reply is nice; "user has been stressed every evening this week" surfacing as a proactive suggestion ("want me to block some recovery time Friday?") is a different product category. That requires exactly what JARVIS built: classify → **log as time-series** → aggregate into context → let the proactive engine read it. Most teams stop at per-message sentiment and wonder why the feature feels gimmicky — the value was never in detecting the mood; it's in *remembering* it.

## Feynman check

Explain: (1) why the mood→emotion map counters negative moods instead of mirroring them; (2) what an MFCC vector fingerprints, in one sentence; (3) why mood readings belong in a log table instead of a variable.
