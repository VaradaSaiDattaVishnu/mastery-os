# Mastery OS

An interactive **AI course** that turns Varada Sai Datta Vishnu's own projects into a path to top‑1% engineering mastery — every concept, to the core.

**Live:** https://varadasaidattavishnu.github.io/mastery-os/

## What it is

A self‑paced learning console mapped directly from real projects (JARVIS, Unity, gharKa, the Order‑Processing System, scale‑quest, mongo‑mastery, tapasya, ToDoApp, and CUBE work).

- **9 tracks · 120 lessons** — Frontend, Backend & APIs, Databases, a full **Order‑Processing‑System deep‑dive**, System Design & Distributed Systems, AI/ML Engineering, CS Foundations, Architecture & Craft, Product/UX.
- **Deep, to‑the‑core lessons** — each authored by a domain specialist: the concept, the internals, the tradeoffs, real code, common pitfalls, a *Top‑1% insight*, and *how it shows up in your project*.
- **Code Dojo** — 71 runnable JavaScript exercises with a live, sandboxed test runner. Do it, don't just read it.
- **Auto‑graded quizzes** (378 questions) and **spaced‑repetition flashcards** (610+ cards, SM‑2) with a daily Review queue — all offline, no key needed.
- **A real mastery model** — per‑concept mastery from reading + quizzes + exercises + recall strength, visualized in **The Atlas** skill‑tree.
- **AI Tutor v2** — streaming, grounded in each lesson. *Teach to the core · Go deeper · Show code · Quiz me · Challenge me · Explain it back (Feynman) · Mock interview · In my project*. Bring your own **free Gemini key** (or any OpenAI‑compatible endpoint like Groq). Key stored only in your browser.
- **Progress + ⌘K command palette + deep links** — everything client‑side.

## AI Tutor setup

Open the ⚙ settings (top‑right), pick **Google Gemini**, paste a free key from
[aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) (no credit card). Or choose
**OpenAI‑compatible** and point it at Groq (`https://api.groq.com/openai/v1`) or OpenAI.

The full curriculum + authored lessons work with **no key**; the tutor adds infinite on‑demand depth, quizzes, and challenges.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · Framer Motion · react‑markdown + rehype‑highlight · React Router (hash).

## Develop

```bash
npm install
npm run dev       # http://localhost:5174
npm run build     # production build → dist/
npm run preview
```

Lesson content lives as raw markdown in `src/content/<lessonId>.md`; the skill tree is `src/curriculum/map.ts`. Pushing to `main` builds and deploys to GitHub Pages via Actions.

---

*A companion to [Vishnu · OS](https://varadasaidattavishnu.github.io/website/).*
