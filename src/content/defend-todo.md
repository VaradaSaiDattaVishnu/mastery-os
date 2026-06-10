A local-first NLP task manager built with React, Redux Toolkit, Tailwind, and MUI. Users type tasks in plain English ("pay rent friday 5pm !!high"), and a zero-dependency regex/heuristic parser resolves the text into a structured `{details, deadline, priority}` object instantly — no API key, no network round-trip. Tasks persist in `localStorage`, desktop reminders fire via the Web Notifications API, and an optional Google Gemini integration (BYO key) unlocks AI task breakdown and a motivational day-plan summary. The whole app deploys as a static SPA on Netlify with no server-side component.

## Architecture

```
src/
  components/       UI layer — Main (task input + DnD list), Task, Remainder (modal),
                    Settings (notification opt-in + Gemini key), PlanMyDay
  utils/
    Store.jsx        Redux store; subscribes to task slice and writes to localStorage
    TaskSlice.jsx    All task mutations as pure RTK reducers seeded from localStorage
    storage.js       loadTasks / saveTasks (localStorage) + first-run seedTasks
    smartParse.js    NLP parser: regex/heuristic → {details, deadline, priority}
    notify.js        Web Notifications API helpers (permission + notifyDue)
    aiClient.js      heuristicPlan (always-free), geminiGenerate, breakdownTask, summarizePlan
```

State flows one way: user input → `parseSmartTask` live preview → `addTask` dispatch → RTK reducer mutates `items` → `store.subscribe` fires `saveTasks(items)` → `localStorage`. The reminder loop is a `setInterval(tick, 10000)` in `Main.jsx` that reads tasks through a `tasksRef` ref (not React state), so it never re-registers on unrelated renders.

## Three decisions you must justify

**Decision 1 — Local-first / localStorage instead of a backend**

Why chosen: The README explicitly calls out that the previous version had a MongoDB backend that could "blank out the whole UI on a server outage." The rewrite eliminated that single point of failure. `storage.js` wraps every `localStorage` call in try/catch so a full or disabled store still leaves the app functional in memory. `Store.jsx` persists via a store subscription, not React effects, so the save is synchronous with every reducer call.

Rejected alternative: REST API + database (e.g. the original MongoDB backend).

Tradeoff accepted: No cross-device sync, no server-side auth, data is tied to one browser profile. If `localStorage` is cleared, tasks are gone. That is acceptable for a personal task manager where instant load and offline reliability outweigh sync convenience.

**Decision 2 — Rolling a regex/heuristic NLP parser (`smartParse.js`) instead of calling an LLM on every keystroke**

Why chosen: The parser runs synchronously in the same JS thread — zero latency, zero cost, zero API key, works offline. It covers the real-world inputs a task manager gets: relative days (`today`, `tomorrow`, `in 3 days`), weekdays (`next fri`), named months (`june 5`, `5 jun`), `mm/dd`, clock times (`5pm`, `17:30`, `noon`), and priority signals (`!!high`, `urgent`, `,low`). Priority regexes are deliberately narrow (e.g. `!!high` or `priority: high`) to avoid consuming real title words like "high-level" or "low battery."

Rejected alternative: Calling Gemini on every keystroke.

Tradeoff accepted: The parser cannot handle truly ambiguous or conversational phrasing ("remind me about the thing with Sarah next week maybe Thursday-ish"). An LLM would parse those correctly but adds latency, cost, and a hard network dependency. The Gemini integration exists as an *optional layer on top*, not a replacement for the core parser.

**Decision 3 — Redux Toolkit instead of React Context or Zustand**

Why chosen: RTK's `createSlice` collocates reducer logic, action creators, and immer-powered mutation in one place. `TaskSlice.jsx` has six focused reducers (`addTask`, `removeTask`, `updateTask`, `setTask`, `sortPendingTasks`, `dndTasks`) all serializable and testable in isolation. The store subscription pattern in `Store.jsx` (`store.subscribe(() => saveTasks(...))`) requires a centralized store reference — harder with Context. RTK DevTools support also makes debugging drag-and-drop order bugs tractable.

Rejected alternative: React Context + `useReducer`.

Tradeoff accepted: RTK adds ~15 kB to the bundle and requires boilerplate (slice file, provider wrap) that Context avoids. For a single-user app with a handful of features, Context would have been lighter. The payoff is predictable state mutations, easy time-travel debugging, and a clean separation between UI components and data logic.

**Decision 4 — Optional BYO Gemini key stored in localStorage**

Why chosen: Every feature works without it. The Gemini key unlocks `breakdownTask` (sub-steps via `gemini-1.5-flash-latest`) and `summarizePlan` (motivational paragraph). The key is stored under `todo_ai_gemini_key` in `localStorage`, never sent anywhere except Google's API. The UI keeps the key in a `<input type="password">` field and only calls `setApiKey` on explicit Save. `hasApiKey()` gates the "Get an AI game plan" button so the UI never silently fails.

Rejected alternative: Ship a server-side proxy that holds the key and exposes an endpoint. That reintroduces a backend, kills the static-deploy story, and adds a secret-management burden. BYO-key keeps the app fully serverless while still offering AI uplift for users who want it.

Tradeoff accepted: Users must obtain and paste their own key. Some won't bother. But those who do get a genuinely useful feature at zero incremental cost to the developer.

## The hardest bug

Natural-language date edge cases and the "past-time rolls to tomorrow" logic in `smartParse.js`.

The trickiest case is a bare clock time with no explicit date: the user types "5pm" on a day when it is already 6pm. The parser sets `date = null` and `time = {h:17, m:0}`, then in the combine step falls back to `base` (today). The resulting `dayjs` object is already in the past. The fix is the guard: `if (!date && (time || partOfDay) && d.isBefore(base)) d = d.add(1, 'day')`. Without it, `submitTask` in `Main.jsx` rejects the task with "That time is already in the past" — which is correct validation, but the UX expectation is "5pm tomorrow." The guard makes the implicit intent explicit.

A related edge: weekday resolution. If today is Friday and the user types "friday," `diff = (5 - 5 + 7) % 7 = 0`. A zero diff would mean today, but the user almost certainly means *next* Friday. The code special-cases `diff === 0 → 7` for unqualified weekdays, and `qualifier === "next"` forces `diff + 7` even when the weekday is still ahead this week.

Timezone is a third surface: all dates are constructed with `dayjs(now)` where `now` defaults to `new Date()` in the user's local timezone. `date.toDate()` preserves that offset. The only risk is if a user has changed their system timezone between task creation and reminder fire — the deadline string stored in `localStorage` is `new Date(finalDeadline).toString()`, which embeds the local timezone offset at write time, so the `setInterval` tick in `Main.jsx` compares correctly with `Date.now()`.

## What you'd change at scale

1. Replace `localStorage` with IndexedDB (via `idb-keyval` or Dexie) to lift the ~5 MB storage cap and avoid blocking the main thread on large task lists.
2. Add an optional sync layer (e.g. CRDTs via `automerge` or a lightweight backend) so the same tasks appear across devices without abandoning the local-first model.
3. Move the 10-second `setInterval` reminder loop to a Service Worker with a Background Sync or Periodic Background Sync registration, so reminders fire even when the browser tab is fully closed (currently they require the tab to be open).
4. Replace `react-beautiful-dnd` (deprecated, no React 18 concurrent-mode support) with `@dnd-kit/core`.
5. Add an undo stack (RTK's history middleware or a simple ring buffer) so accidental deletes are recoverable without relying on `localStorage` snapshots.
6. Parameterize `smartParse.js` for locale: the `mm/dd` parser assumes US date format; European users expect `dd/mm`.

## Probing Q&A

**Q: Walk me through exactly how "pay rent friday 5pm !!high" gets parsed.**

A: `parseSmartTask` receives the string and wraps it in spaces: `" pay rent friday 5pm !!high "`. Priority runs first — the `HIGH` regex matches `!!high`, sets `priority = "4-High"`, and strips the token, leaving `" pay rent friday 5pm  "`. Time parsing matches `5pm` with the `(\d{1,2})(am|pm)` branch, computing `h=17, m=0`, strips `5pm`. Weekday parsing matches `friday` with `WEEKDAYS["friday"] = 5`; today's day index is checked, `diff` is computed (e.g. 3 if today is Tuesday), and `date = base.add(3, "day")`. The combine step sets `deadline = dayjs(date).hour(17).minute(0).second(0).toDate()`. Title cleanup strips leftover whitespace; the first letter is uppercased: `"Pay rent"`. `matched = true` because both deadline and priority were set. The live preview chip in `Main.jsx` calls `describeParse` which formats it as `"Fri Jun 12, 5:00 PM"` + `"🔴 High"`.

**Q: Why local-first instead of a backend?**

A: The previous version had a MongoDB backend that introduced a single point of failure — a server hiccup blanked the entire UI. The local-first rewrite stores all tasks in `localStorage` under the key `todo_tasks_v1`. `saveTasks` and `loadTasks` in `storage.js` wrap every call in try/catch, so if `localStorage` is full or disabled the app degrades gracefully to in-memory operation. Load time is instant because there is no network round-trip. The accepted tradeoff is no cross-device sync.

**Q: How do desktop reminders fire when the tab is in the background?**

A: They use the browser's Web Notifications API, not a server push. `notify.js` calls `new Notification(...)` which the OS delivers as a system notification — the browser renders it outside the tab. The trigger is a `setInterval(tick, 10000)` in `Main.jsx` that runs every 10 seconds. The `tick` function reads `tasksRef.current` (a ref that mirrors the latest Redux state without causing the effect to re-register) and calls `notifyDue(task)` for any task whose deadline has passed and that has not already been notified this session (tracked in `notifiedRef`, a `Set`). The limitation is that if the tab is *closed* entirely, no reminders fire — a Service Worker with Periodic Background Sync would be required for that.

**Q: Why Redux Toolkit for an app this size? Isn't it overkill?**

A: RTK's `createSlice` with immer lets the six reducers in `TaskSlice.jsx` be written as direct mutations while remaining pure functions — no spread boilerplate. More importantly, the `store.subscribe` pattern used in `Store.jsx` to persist tasks to `localStorage` requires a stable external store reference that Context + `useReducer` does not provide cleanly. The `dndTasks` reducer also needs to reorder the pending array and renumber `pindex` atomically, which is straightforward in immer but verbose with spread. The DevTools payoff is also real: drag-and-drop order bugs are easy to diagnose by replaying actions.

**Q: The snooze button in the Remainder modal — how does it avoid the reminder firing again immediately?**

A: `updateRemainder` in `Remainder.jsx` computes `fromMs = Math.max(dueMs, Date.now())` — if the deadline is already in the past, it snoozes from *now*, not from the (already past) deadline. It adds 10 minutes and dispatches `updateTask` with the new deadline string and `overdue: false`. Back in `Main.jsx`, the `tick` function only fires `notifyDue` for tasks that are both past their deadline AND not already in `notifiedRef`. After a snooze dispatch, the task's new deadline is 10 minutes in the future, so `new Date(task.deadline).getTime() < Date.now()` is false and the task is excluded from `dueTasks` until the new time arrives. `notifiedRef` also has its stale entries pruned each tick: any id no longer in `dueIds` is deleted, so the re-triggered notification fires correctly after the snooze period.

**Q: How does `heuristicPlan` decide the order in "Plan my day"?**

A: In `aiClient.js`, `heuristicPlan` maps each pending task to a score: `urgency * 3 + priority_rank * 2`. Urgency is 4 for overdue, 3 for due within 24 hours, 2 for within 72 hours, 1 for within 168 hours (one week), 0 for later or no date. Priority rank maps `"4-High"` → 3, `"3-Medium"` → 2, `"2-Low"` → 1, `"1-None"` → 0. Tasks are sorted descending by score; ties are broken by ascending hours-until-due. The result is annotated with a `reason` string (`"overdue"`, `"due today"`, etc.) displayed as a colored badge in `PlanMyDay.jsx`. The Gemini summary, if a key is present, receives only the top 8 task titles and returns a 2-3 sentence motivational paragraph.

**Q: What happens if `localStorage` is full when you save a task?**

A: `saveTasks` in `storage.js` wraps `localStorage.setItem` in a try/catch and silently swallows the `QuotaExceededError`. The Redux state is already updated in memory, so the task appears in the UI for the current session. On next page load, `loadTasks` will return the last successfully persisted state — the task added during the full session will be gone. There is no user-facing warning. A production fix would be to catch the error and surface a toast: "Storage full — tasks saved in memory only."

**Q: How does the notification permission request get tied to a user action?**

A: Browsers require `Notification.requestPermission()` to be called inside a user-gesture handler or risk being blocked silently. In `Main.jsx`, `submitTask` (triggered by pressing Enter or the submit path) checks `notificationPermission() === "default"` and, on the *first* task add, calls `ensureNotificationPermission()`. This deferred ask is gated by `askedPermRef.current` so it fires at most once. The Settings panel also has an explicit "Enable notifications" button for users who want to opt in before adding their first task.
