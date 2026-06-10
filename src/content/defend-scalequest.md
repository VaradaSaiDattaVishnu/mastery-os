Scale Quest is a fully client-side, browser-based system design learning game you built with React 18, Vite, Tailwind CSS, Framer Motion, and Zustand. It presents 60 sequentially organized levels — spanning HLD Fundamentals (1–25), LLD OOP and Design Patterns (26–43), LLD Interview Problems (44–50), and HLD Case Studies (51–60) — as an interactive narrative where each level has an interactive simulation, concept explanations, a "deep dive" accordion, a "side quest" (real-world incident story, e.g. the Facebook BGP outage), and a 4–5 question quiz. Submitting the quiz calls `onComplete()`, which triggers `completeLevel(levelId)` in the Zustand store, persisting progress via `zustand/middleware/persist` to `localStorage` under the key `scale-quest-storage`.

## Architecture

**Level content model.** The `LEVELS` array in `src/context/gameStore.js` is the single source of truth for all level metadata: `id`, `title`, `subtitle`, `description`, `concepts[]`, `icon`, `color` (Tailwind gradient string), `story`, `part`, and `difficulty`. Each level's interactive body lives in its own file `src/levels/LevelN.jsx`, exported as a default React component that accepts `{ levelId, level, isCompleted, onComplete, learnTerm, unlockAchievement, markDeepDiveRead }` as props. The `Level.jsx` shell component reads `levelId` from `useParams`, looks up the level in `LEVELS`, resolves the correct component from a static `levelComponents` map (all 60 imports at the top), and renders it inside a Framer Motion animated container.

**Routing.** React Router v6 with a `basename` derived from `import.meta.env.BASE_URL` so the app routes correctly under the GitHub Pages sub-path `/scale-quest/`. Four routes: `/` (LevelMap), `/level/:levelId` (Level shell), `/glossary`, `/achievements`.

**State and persistence.** A single Zustand store wraps all game state: `completedLevels` (array of integer IDs), `xp` (integer), `currentLevel`, `levelProgress` (object keyed by level ID for within-level state), `achievements`, `learnedTerms`, `deepDivesRead`. The `persist` middleware serializes the entire store to `localStorage['scale-quest-storage']` on every `set()` call. There is no backend; the app is deployed as a static site to GitHub Pages via a GitHub Actions workflow that runs `npm run build` and uploads `dist/` using `actions/upload-pages-artifact`.

**Level unlock logic.** `isLevelUnlocked` in the store unconditionally returns `true` — all levels are open for free study. The `Level.jsx` shell still checks it and would show a locked screen if it returned `false`, but in the current implementation it never does. Completion still gates the "Next Level" navigation button: that button only appears if `isCompleted` is true for the current level.

**Level completion flow.** Inside each `LevelN.jsx`, `handleQuizSubmit` sets local `quizSubmitted` state to `true`, checks whether all quiz answers are correct (to optionally fire `unlockAchievement('perfectionist')`), then calls `onComplete?.()`. The `onComplete` prop is provided by `Level.jsx` as `() => completeLevel(id)`. `completeLevel` in the store: (a) adds the level ID to `completedLevels` if not already present, (b) awards `levelId * 100` XP (later levels are worth more), (c) advances `currentLevel` to `max(currentLevel, levelId + 1)`. XP also accumulates separately for learning glossary terms (+10 each), reading deep dives (+25), and unlocking achievements (+50).

**XP and player level.** Player level is computed on read: `Math.floor(Math.sqrt(xp / 100)) + 1`. XP to next level follows `playerLevel^2 * 100`. This is a square-root curve — early levels come quickly; progression slows as the player advances.

**Glossary and terminology.** A flat `GLOSSARY` array of `{ term, category, definition }` objects lives directly in `Glossary.jsx`. When a `<Term>` inline component is clicked inside a level, it calls `learnTerm(word)` on the store, which pushes the term string into `learnedTerms[]` and adds 10 XP (idempotent — no-op if already learned).

## Three decisions you must justify

**Decision 1: Fully client-side with no backend**
Why: The app's entire purpose is content delivery and local progress tracking. A backend would require auth, a database, hosting costs, and operational overhead that add no learning value. GitHub Pages hosts the built static assets for free.
Rejected alternative: A Node/Express API + database persisting progress server-side.
Tradeoff: Progress is siloed per browser/device. Clearing localStorage or switching devices resets all progress. There is also no cross-device sync, no leaderboards with verified scores, and no admin analytics on which levels users drop out of. Acceptable for an MVP learning tool, but a real product at scale would need at least optional account sync.

**Decision 2: Zustand over Redux**
Why: The store has a small, flat state shape (`completedLevels`, `xp`, `achievements`, `learnedTerms`, etc.) and a handful of imperative actions. Zustand's `create` + `persist` handles this in ~130 lines with zero boilerplate. There is no need for reducers, action creators, middleware chains, or selectors.
Rejected alternative: Redux Toolkit. RTK is the right choice when you have complex, normalized state, time-travel debugging needs, or a large team that benefits from strict unidirectional patterns.
Tradeoff: Zustand's loose structure means there is no enforced convention for how state is mutated. In a larger team or codebase, this can lead to inconsistent patterns. For a single-developer project this is not a problem.

**Decision 3: Content as 60 individual JSX files rather than a data schema**
Why: Each level has a unique interactive simulation (the server load simulator in Level 1, the scaling crossroads in Level 2, the consistent hashing ring in Level 9, etc.) that requires custom React component logic — state machines, animations, canvas drawing — that cannot be expressed as pure JSON data. Keeping each level as its own JSX file means a level's simulation, narrative copy, deep dive, and quiz are co-located and independently maintainable.
Rejected alternative: A CMS-backed data model where level content is stored as JSON/Markdown and rendered through a generic template component.
Tradeoff: Adding a new level requires writing a new `.jsx` file, adding a manual import to `Level.jsx`, adding an entry to the `levelComponents` map, and adding the metadata object to `LEVELS`. There is no content pipeline, no hot-swapping levels, and the initial bundle includes all 60 level modules (though Vite can code-split them). At 60 levels this is manageable; at 600 it would be untenable.

## The hardest bug

The trickiest class of issue in this architecture is the **localStorage schema migration problem**. The `persist` middleware serializes the entire Zustand store to `localStorage['scale-quest-storage']`. If you ship a new version that adds a field to the store's initial state (say, a new `streakDays` counter), returning users have old serialized state without that field. Zustand's `persist` by default merges the persisted value with the initial state using a shallow merge, so new top-level keys are added. But if you rename a key (e.g., `completedLevels` → `finishedLevels`) or restructure a nested object, users get corrupted or partially-migrated state — or the `merge` produces a store where the new field is initialized but the old data is silently dropped. There is no version field or migration function in the current `persist` config, meaning any breaking schema change will silently break returning users' progress with no recovery path.

## What you'd change at scale

1. **Add a `version` + `migrate` option to the persist config.** Zustand's persist middleware supports `version` and `migrate` callbacks. Defining these would let you safely reshape the stored schema between releases without wiping user progress.
2. **Code-split level components.** All 60 `LevelN.jsx` files are currently statically imported in `Level.jsx`. Switching to `React.lazy(() => import('../levels/LevelN'))` with a `Suspense` boundary would dramatically reduce the initial bundle size, which matters especially on mobile.
3. **Extract quiz logic into a shared component.** Every `LevelN.jsx` duplicates the same quiz rendering loop, answer tracking state, and submit handler. A `<QuizSection questions={...} onComplete={onComplete} onPerfect={() => unlockAchievement('perfectionist')} />` component would remove hundreds of lines of duplicate code across 60 files.
4. **Add optional account sync.** localStorage is fragile (incognito mode, device switching, browser data clears). An optional sign-in backed by a lightweight KV store (e.g., Cloudflare Workers + D1) would let users persist progress across devices without requiring a full backend from day one.
5. **Replace the flat `LEVELS` array with a structured curriculum manifest.** Separating the curriculum metadata (parts, difficulty, concepts) from the store would allow filtering, curriculum queries, and progress analytics without coupling content structure to state management.

## Probing Q&A

**Q: Why is the app fully client-side? What breaks if a user clears their browser storage?**
A: The only state is local: Zustand's `persist` middleware writes to `localStorage['scale-quest-storage']`. Clearing localStorage — or opening the site in a different browser, incognito, or on another device — starts the user from scratch with zero completed levels and zero XP. There is no recovery path in the current implementation because there is no backend, no account, and no export/import feature. This was a deliberate tradeoff: no hosting cost, no auth, no ops. For a production product I would add an optional account layer and implement the Zustand `migrate` callback to handle schema evolution.

**Q: How exactly is level completion checked? Can a user complete a level without answering the quiz?**
A: In every `LevelN.jsx`, the Submit button is disabled while `Object.keys(quizAnswers).length < quizQuestions.length` — the user must select an answer for every question. Clicking Submit calls `handleQuizSubmit`, which sets `quizSubmitted = true` and unconditionally calls `onComplete?.()` regardless of whether the answers are correct. So a user can complete a level with wrong answers. Only getting every answer correct triggers `unlockAchievement('perfectionist')`. This is intentional — the game is about learning, not gatekeeping.

**Q: How do you model 60 levels as data vs. code? What's the boundary?**
A: The `LEVELS` array in `gameStore.js` holds the metadata that drives the UI shell: title, subtitle, description, concepts list, icon, color gradient, story teaser, part name, and difficulty. The actual level body — the interactive simulation, concept explanations, deep dives, quiz questions — lives in each `LevelN.jsx`. The shell `Level.jsx` reads metadata from the store and renders the JSX component. The split is: anything needed to render the map, lock/unlock UI, or progress tracking goes into `LEVELS`; anything that requires custom interactivity goes into the JSX file.

**Q: Why Zustand instead of Redux or React Context?**
A: The state is a flat object with about eight fields and seven action functions. Zustand's `create` + `persist` handles this in roughly 130 lines with no additional files. Redux Toolkit would require a slice, action creators, a store configuration, and likely `redux-persist`. React Context alone has no built-in persistence and causes full re-renders on any state change, which would be visible with Framer Motion animations running. Zustand is a direct fit for the scale of this problem.

**Q: How would you add cross-device account sync later without a full rewrite?**
A: Zustand's `persist` accepts a custom `storage` object instead of `localStorage`. You could swap in a storage adapter that reads/writes to a remote KV store (e.g., Cloudflare Workers KV, Supabase) while keeping every component unchanged. The only additional work is auth (a JWT-based login) and a conflict resolution policy for when two devices have diverging `completedLevels` arrays (last-write-wins or union-of-arrays both work here since completing a level is idempotent).

**Q: How does progress within a level work, and what happens to it if the user refreshes?**
A: `updateLevelProgress(levelId, progress)` shallow-merges an arbitrary object into `levelProgress[levelId]` in the store, and because `persist` serializes the entire store to localStorage on every `set`, in-progress state survives page refreshes. However, each `LevelN.jsx` initializes its local React state (`useState`) fresh on mount — the local simulation state (server load, request queue, quiz answers) is not read back from `levelProgress`. So the interactive simulation resets on refresh, but the store's record of which levels are fully `completedLevels` is durable.

**Q: What does the XP formula look like and why?**
A: Completing level N awards `N * 100` XP — a linear scaling that makes later, harder levels more rewarding. Bonus XP: +10 per glossary term learned, +25 per deep dive read, +50 per achievement unlocked. Player level is computed as `Math.floor(Math.sqrt(xp / 100)) + 1`. The square-root curve means the first few player levels are cheap (encouraging early progress), but later levels require exponentially more XP (reflecting mastery depth). XP needed for the next player level is `playerLevel^2 * 100`.

**Q: The `isLevelUnlocked` function in the store always returns `true`. Is that a bug?**
A: No, it's a deliberate product decision documented in the comment: "All levels unlocked for free study." The original data model set `unlocked: false` on levels 2–60, and the store still has an `unlockLevel` function that checks sequential completion. The `isLevelUnlocked` override opens the curriculum completely. The `Level.jsx` shell still calls `isLevelUnlocked` and would show a locked screen if it returned `false`, so the gating mechanism is intact and could be re-enabled by changing one line. The "Next Level" navigation button still requires `isCompleted` to be true, so sequential discovery is encouraged but not enforced.

**Q: How is the app deployed, and what would break if you renamed a route?**
A: Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs `npm run build` and uploads `dist/` to GitHub Pages via `actions/upload-pages-artifact` and `actions/deploy-pages`. The Vite config sets `base: '/scale-quest/'` in production mode, and `main.jsx` reads `import.meta.env.BASE_URL` to set the React Router `basename`. GitHub Pages serves a static site with no server-side routing, so direct navigation to `/scale-quest/level/5` would 404 without the `public/404.html` file, which redirects unknown paths back to the index. Renaming a route would require updating the 404 redirect script and any hardcoded links.
