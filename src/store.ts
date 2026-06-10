import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Provider } from './ai/tutor'
import { newCard, schedule, type CardState, type Grade } from './lib/srs'

interface MasteryState {
  // progress
  completed: Record<string, boolean>
  lastLessonId: string | null
  toggleComplete: (id: string) => void
  setComplete: (id: string, v: boolean) => void
  visit: (id: string) => void

  // quizzes — best fraction correct per lesson (0..1)
  quizBest: Record<string, number>
  recordQuiz: (lessonId: string, fraction: number) => void

  // exercises — passed flags keyed by `${lessonId}#${index}`
  exercisesPassed: Record<string, boolean>
  markExercise: (key: string, passed: boolean) => void

  // spaced repetition — card state keyed by `${lessonId}#${index}`
  cards: Record<string, CardState>
  gradeCard: (cardId: string, grade: Grade) => void

  // AI settings (stored locally only)
  provider: Provider
  apiKey: string
  model: string
  baseUrl: string
  setAI: (partial: Partial<Pick<MasteryState, 'provider' | 'apiKey' | 'model' | 'baseUrl'>>) => void

  // UI (not persisted)
  paletteOpen: boolean
  togglePalette: (v?: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
}

export const useStore = create<MasteryState>()(
  persist(
    (set) => ({
      completed: {},
      lastLessonId: null,
      toggleComplete: (id) => set((s) => ({ completed: { ...s.completed, [id]: !s.completed[id] } })),
      setComplete: (id, v) => set((s) => ({ completed: { ...s.completed, [id]: v } })),
      visit: (id) => set({ lastLessonId: id }),

      quizBest: {},
      recordQuiz: (lessonId, fraction) =>
        set((s) => ({ quizBest: { ...s.quizBest, [lessonId]: Math.max(s.quizBest[lessonId] ?? 0, fraction) } })),

      exercisesPassed: {},
      markExercise: (key, passed) =>
        set((s) => ({ exercisesPassed: { ...s.exercisesPassed, [key]: passed || !!s.exercisesPassed[key] } })),

      cards: {},
      gradeCard: (cardId, grade) =>
        set((s) => {
          const now = Date.now()
          const current = s.cards[cardId] ?? newCard(now)
          return { cards: { ...s.cards, [cardId]: schedule(current, grade, now) } }
        }),

      provider: 'gemini',
      apiKey: '',
      model: 'gemini-2.0-flash',
      baseUrl: 'https://api.groq.com/openai/v1',
      setAI: (partial) => set(partial),

      paletteOpen: false,
      togglePalette: (v) => set((s) => ({ paletteOpen: v ?? !s.paletteOpen })),
      settingsOpen: false,
      setSettingsOpen: (v) => set({ settingsOpen: v }),
    }),
    {
      name: 'mastery-os',
      partialize: (s) => ({
        completed: s.completed,
        lastLessonId: s.lastLessonId,
        quizBest: s.quizBest,
        exercisesPassed: s.exercisesPassed,
        cards: s.cards,
        provider: s.provider,
        apiKey: s.apiKey,
        model: s.model,
        baseUrl: s.baseUrl,
      }),
    },
  ),
)
