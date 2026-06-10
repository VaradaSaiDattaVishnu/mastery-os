import type { LessonPractice, TrackPractice } from '../curriculum/types'

// Practice content (quizzes / flashcards / exercises) is authored as one JSON
// file per track and eagerly merged. Missing files simply contribute nothing.
const mods = import.meta.glob('./*.json', { eager: true }) as Record<string, unknown>

const all: TrackPractice = {}
for (const k in mods) {
  const m = mods[k] as { default?: TrackPractice } | TrackPractice
  const data = (m as { default?: TrackPractice }).default ?? (m as TrackPractice)
  Object.assign(all, data)
}

export function getPractice(id: string): LessonPractice | undefined {
  return all[id]
}

export const practiceCount = Object.keys(all).length
