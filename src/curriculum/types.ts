// ── Curriculum structure (the map) ───────────────────────────────────────────
export interface Lesson {
  id: string
  title: string
  /** one-sentence essence shown before the deep content loads */
  coreIdea: string
  /** which of Vishnu's projects this concept powers */
  project?: string
  concepts: string[]
  minutes?: number
}

export interface Module {
  id: string
  title: string
  summary: string
  lessons: Lesson[]
}

export interface Track {
  id: string
  title: string
  tagline: string
  color: string
  modules: Module[]
}

// ── Lesson content (authored deep material) ──────────────────────────────────
export interface QuizQ {
  q: string
  options: string[]
  /** index into options */
  answer: number
  explain: string
}

export interface Flashcard {
  front: string
  back: string
}

export interface LessonContent {
  /** markdown body — the deep, to-the-core teaching */
  body: string
  quiz?: QuizQ[]
  flashcards?: Flashcard[]
  /** suggested prompts to fire at the AI tutor */
  deepDives?: string[]
}

/** keyed by lesson id */
export type TrackContent = Record<string, LessonContent>
