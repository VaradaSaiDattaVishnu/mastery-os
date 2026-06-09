import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Provider } from './ai/tutor'

interface MasteryState {
  // progress
  completed: Record<string, boolean>
  lastLessonId: string | null
  toggleComplete: (id: string) => void
  setComplete: (id: string, v: boolean) => void
  visit: (id: string) => void

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
        provider: s.provider,
        apiKey: s.apiKey,
        model: s.model,
        baseUrl: s.baseUrl,
      }),
    },
  ),
)
