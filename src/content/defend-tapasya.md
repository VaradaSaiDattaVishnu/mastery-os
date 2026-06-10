Tapasya is a trauma-informed personal learning app deployed at https://varadasaidattavishnu.github.io/tapasya/. It spans five pillars — Memory, Observation, Reading People, Second Brain, and a Trauma Stabilisation track — with a deliberate, principled absence of every motivational mechanic that defines mainstream e-learning: no streaks, badges, leaderboards, points, or AI grading. The README states it plainly: "fast progress is treated as a signal to slow down, not a reward."

## Architecture

**Stack**: React 18, Vite 5, Tailwind CSS 3 (with a fully custom design-token system), Framer Motion 11, Zustand 4 with the `persist` middleware, React Router v6. No backend, no auth, no network calls at runtime.

**Persistence**: A single Zustand store (`src/context/tapasyaStore.js`) is persisted to `localStorage` under the key `tapasya-storage`. The store holds completed lessons, session timestamps, nervous-system check-ins, vault notes (typed as `fleeting | literature | evergreen | moc`), FSRS cards and their review history, journal entries, and prompt answers. All data stays on the learner's device.

**Content model**: 5 pillars → N modules → M lessons. Pillars and their module/lesson ID trees are statically defined in `PILLARS` inside `tapasyaStore.js` (e.g. `memory.foundations.forgetting-curve`). `src/content/registry.js` maps every lesson ID to the React component that renders it. `LessonView` resolves the URL params `/:pillarId/:moduleSlug/:lessonSlug` against `PILLARS`, looks up the component, and renders it, passing down `onComplete`, `addJournalEntry`, and `savePromptAnswer` callbacks.

**Pacing subsystem**: Two exported functions in `tapasyaStore.js` implement the anti-rush logic.

- `computePace(sessions, checkins)` scans the last 7 days of session data and check-ins. It returns one of four labels — `'overrun'`, `'pushing'`, `'rested'`, `'engaged'`. A learner hits `'overrun'` if they have used the Stop button twice or more, or if three or more check-ins show sympathetic/dorsal arousal at intensity ≥ 4. `'pushing'` fires if total minutes exceed 35×7 = 245 minutes in a week, or if trauma sessions exceed 4. The pace label drives the `PaceMeter` component on the Home dashboard, which displays a contextual message ("You have been pushing hard. Consider taking a break.").

- `isTraumaModuleUnlocked(moduleId, completedLessons, checkins, moduleOpenDates)` enforces a hard 3-requirement gate per trauma module: 14 calendar days since the previous module was first opened (tracked in `moduleOpenDates`), all lessons in that module completed, and at least 7 nervous-system check-ins in the last 14 days. The minimum calendar time to traverse all 9 trauma modules at perfect compliance is 112 days; realistic pacing is 12+ months. When locked, the store returns a human-readable `reason` string ("3 days until this module opens. There is no hurry.") rather than a generic error.

**Widget layer** (`src/components/widgets/`): All interactive elements are trauma-aware. `StopButton` is always mounted, always fixed top-right, always reachable via Escape — using it sets `stopButtonUsed: true` on the session record, which feeds the pace algorithm. `NervousSystemCheckin` is a 6-step (~90 second) polyvagal-informed check-in (breathe → state → intensity → glimmer → note → thanks), also accessible as a skip-all path. `BreathingDot` is the only ambient animation in the app; it respects `prefers-reduced-motion` and pauses when the tab is hidden. `FeynmanCheck` uses self-rated rubrics with no AI grading. `ReflectionJournal` explicitly labels itself private, auto-saves on blur, and loads previous drafts on mount.

**Design system**: Tailwind tokens (`tailwind.config.js`, `src/styles/index.css`) are named for emotional states rather than functional roles: `accent-grounded` (sage, "yes, that's right"), `accent-noticed` (amber, "pause, notice"), `accent-stilled` (slate-blue, neutral calm), `accent-warm` (terracotta, "sparingly, NEVER for wrong"). Easing functions are named `'calm'`, `'settle'`, and `'inhale'`. Spacing tokens are `'breath'`, `'pause'`, `'rest'`, `'whisper'`.

## Three decisions you must justify

**Decision 1 — Deliberate absence of gamification**

Every mainstream learning platform — Duolingo, Coursera, Khan Academy — uses streaks, badges, and points. Tapasya has none. The comment at the top of `tapasyaStore.js` is the design statement: "No points, no badges, no streaks, no leaderboards. Fast progress is a WARNING SIGN, not a success metric." This was not an omission; it was the first architectural constraint. Gamification is antithetical to trauma-informed work for two reasons. First, streak mechanics create anxiety around missing a day, and for someone whose nervous system is already under load, that anxiety is iatrogenic harm. Second, the dopamine loop of badges rewards throughput rather than integration — it actively incentivises rushing, which the store's pacing logic explicitly detects and flags as dangerous. The rejected alternative was a "gentle" badge system (e.g. non-streak achievements like "completed 3 modules"). The tradeoff: without extrinsic motivation signals, engagement metrics will look terrible by conventional SaaS standards. That is accepted. The measure of success is whether a person's nervous system feels safer over time, not whether they open the app daily.

**Decision 2 — Local-first, no backend**

All data lives in the user's browser via `localStorage` (Zustand `persist`, key `tapasya-storage`). There is no user account, no server, no analytics. Trauma journals, check-in states (sympathetic/dorsal/ventral), glimmer notes — these are among the most sensitive records a person can generate. The rejected alternative was a lightweight backend with user accounts, which would enable cross-device sync and proper backups. The tradeoff is that data is device-bound and vulnerable to browser cache clearing. This was accepted because the privacy cost of centralised storage is asymmetric: a data breach of trauma journals or nervous-system states is harmful in a way that losing a backup is not. The `ReflectionJournal` component makes this explicit in its UI copy: entries are described as "completely private."

**Decision 3 — Hard calendar gating on the trauma track**

Non-trauma pillars require only that one lesson in the previous module be completed before the next unlocks — a soft gate. The trauma pillar uses `isTraumaModuleUnlocked` with three simultaneous requirements: 14-day wait, full completion, and 7 check-ins in the past 14 days. This enforces a minimum 112-day calendar span across 9 modules. The rejected alternative was purely completion-based unlocking (like the other pillars). The tradeoff: a motivated, psychologically stable learner could argue this is patronising. The counter-argument is that the nervous system's integration timeline is not correlated with intellectual motivation; the calendar gate exists to insert unavoidable rest time regardless of how the learner feels about needing it.

**Decision 4 — Content model as static JSX, no CMS**

Each lesson is a React component (e.g. `Lesson1_WhySlow.jsx`) that hardcodes prose, interactive widgets, and visual exercises. There is no headless CMS, no MDX pipeline, no database-backed content. The `registry.js` file is a flat map of 200 lesson IDs to components. Rejected alternative: MDX with frontmatter for content authoring by non-developers. The tradeoff is that adding or editing lessons requires a code deploy; the gain is that each lesson can embed arbitrary interactive React components (3D memory palace, breathing dot, branching scenario) without a CMS adapter layer.

## The hardest bug

The most subtle class of bug in this architecture is the trauma module unlock race condition around `moduleOpenDates`. The `setCurrentModule` action in the store only records `moduleOpenDates[moduleId] = Date.now()` the first time a module is opened. If a user navigates directly to a lesson URL (bypassing `ModuleOverview`), `LessonView` calls `setCurrentModule(mod.id)` in a `useEffect`, which correctly stamps the date. However, if the same effect fires twice in React 18's strict mode (which double-invokes effects in development), the date is still idempotent because the store checks `!state.moduleOpenDates[moduleId]` before writing. The real production risk is the opposite: a user who opens a trauma module, immediately closes the tab, and then checks the unlock status for the next module will find 0 days elapsed with no route to reset the clock short of clearing `localStorage` — because the timestamp was recorded on the first open, not on a meaningful engagement event. A more defensible model would be to stamp the date on the first completion within a module rather than on first open, but that would make the 14-day requirement harder to explain to the user.

## What you'd change at scale

**Cross-device sync without centralised storage**: The local-first model is the right default but breaks for anyone with more than one device. A local-first sync layer using CRDTs (e.g. Automerge or Yjs) over end-to-end-encrypted storage would preserve the privacy model while enabling sync.

**FSRS implementation**: The current `reviewCard` in the store is a hand-rolled approximation ("Simplified interval calculation (real FSRS is more nuanced)") with fixed base-day intervals and a linear stability multiplier. At scale, this should use the actual FSRS-5 algorithm with per-user parameter optimisation, which requires a review-history dataset per user — possible with local-first sync.

**Trauma module gating UX**: The lock-reason strings ("3 days until this module opens. There is no hurry.") are good, but the pacing system should surface a qualitative summary rather than a countdown. Counting down days to trauma content is a subtle form of the urgency it is designed to prevent.

**Content authoring**: 200 hardcoded JSX files means every content edit is a code deploy. An MDX layer or a structured content format that supports embedded widget declarations would allow clinician co-authors to contribute without engineering involvement.

## Probing Q&A

**Q: Most learning apps add streaks to boost retention — why did you remove them, and how do you defend that to a PM?**

A: Streaks are a retention mechanic that works by inducing mild anxiety about breaking a chain. For a general-purpose app that anxiety is an acceptable tradeoff. For a trauma-informed app it is contraindicated: a person in a dorsal/shutdown state cannot maintain a streak, and the notification that the streak is broken is a punishment precisely when the nervous system is least able to cope with it. I would tell the PM that the product's success metric is not DAU or streak rate — it is whether a person's nervous system regulation improves over weeks. Those are measurable (via check-in trend data already stored) but not in a standard analytics dashboard, which is part of why the product does not try to optimise for standard analytics.

**Q: How do you measure success without engagement metrics?**

A: The store already collects the right signals: check-in state and intensity over time (is the user trending from dorsal toward ventral?), stop-button usage rate (a proxy for self-regulation capacity), the ratio of trauma track pace labels (are overrun events decreasing?), and completion rate on FeynmanCheck self-assessments. None of these are sent to a server, so aggregate product analytics require users to opt into exporting their data. That is a deliberate friction. At a product level, qualitative interviews and the observable correlation between check-in trends and self-reported wellbeing are the intended success signals.

**Q: How is progress modeled and stored?**

A: `completedLessons` is a flat array of lesson ID strings in the Zustand store, persisted to `localStorage`. A lesson is marked complete when the user clicks "I'm done with this for now" (a button labeled to be non-pressuring, not "Mark complete"). There is no score, no percentage, no time-based metric. Module unlocking reads `completedLessons` via `isModuleUnlocked` which checks for at least one completed lesson in the prior module (non-trauma) or all lessons (trauma).

**Q: What's trauma-informed about the UX, concretely?**

A: Four specific implementations. First, `StopButton` — permanently mounted, keyboard-accessible via Escape, never causes data loss, offers two calm options ("Come back later" / "I'm okay, just needed a beat") with no judgment framing. Second, `NervousSystemCheckin` — begins with a 3-breath grounding step, uses polyvagal-derived state labels (ventral/sympathetic/dorsal), asks for intensity on a 1–5 scale, and ends with "No analysis, no score. Just noticing." Third, the trauma pillar shows a sensitive-content banner on every lesson and routes all check-in results into the pacing algorithm. Fourth, the design token naming: error states use `accent-noticed` (amber, "pause, notice") never red; the word "wrong" does not appear in the codebase in any user-facing context; `accent-warm` (terracotta) is annotated in code as "sparingly, NEVER for wrong."

**Q: Why is the Reading People pillar marked `ethicsGated: true` in the PILLARS definition?**

A: The `ethicsGated` flag causes the pillar description to surface the note "Every module is ethics-gated: this knowledge carries responsibility." The first module in that pillar is "Ethics Filter Deep" — it must be engaged before any other Reading People content becomes accessible. The design argument is that skills for reading micro-expressions, mentalization, and NVC can be misused for manipulation; the ethics module forces the learner to articulate their ethical stance before gaining the technical vocabulary.

**Q: The store has a simplified FSRS implementation. Why not use a library?**

A: There is no production-ready, zero-dependency FSRS-5 JavaScript library that was suitable at the time. The store comment says explicitly: "Simplified interval calculation (real FSRS is more nuanced)." The implementation uses fixed base intervals (again=1d, hard=3d, good=7d, easy=14d) with a stability multiplier. This is adequate for demonstrating the concept and the UI; a production upgrade would replace `reviewCard` with the actual FSRS-5 scheduler once the review-history dataset is established.

**Q: What happens if a user clears their browser storage?**

A: All progress is lost. This is a known limitation of the local-first architecture, documented in the Settings placeholder: "Your data stays on your device." There is no recovery path. The `resetProgress` action in the store resets to initial state and is described as requiring "UI should double-confirm." The intended future mitigation is an export-to-JSON feature, not a backend.

**Q: The completion button says "I'm done with this for now" — why that specific copy?**

A: The phrasing is deliberate on two axes. "I'm done" is present-tense and decisive — it does not say "I understand this completely" or "I have mastered this," which would introduce performance anxiety. "For now" signals that returning is normal and expected, not a failure. The copy was chosen to lower the bar for self-permission to move on, which is particularly important in trauma content where learners may feel they haven't "done it right" unless they've felt every emotion the material invites.
