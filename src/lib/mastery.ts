import { getPractice } from '../practice'
import { strength, type CardState } from './srs'
import { useStore } from '../store'

export interface MasterySlices {
  completed: Record<string, boolean>
  quizBest: Record<string, number>
  exercisesPassed: Record<string, boolean>
  cards: Record<string, CardState>
}

// Weights: reading 30% · quiz 30% · exercises 25% · recall 15%.
// When a lesson lacks a given practice type, reading-completion stands in for it.
export function masteryOf(id: string, s: MasterySlices): number {
  const p = getPractice(id)
  const read = s.completed[id] ? 1 : 0
  let m = 0.3 * read

  if (p?.quiz?.length) m += 0.3 * (s.quizBest[id] ?? 0)
  else m += 0.3 * read

  if (p?.exercises?.length) {
    const passed = p.exercises.filter((_, i) => s.exercisesPassed[`${id}#${i}`]).length
    m += 0.25 * (passed / p.exercises.length)
  } else m += 0.25 * read

  if (p?.flashcards?.length) {
    const avg = p.flashcards.reduce((acc, _, i) => acc + strength(s.cards[`${id}#${i}`]), 0) / p.flashcards.length
    m += 0.15 * avg
  } else m += 0.15 * read

  return Math.min(1, m)
}

export function trackMastery(lessonIds: string[], s: MasterySlices): number {
  if (!lessonIds.length) return 0
  return lessonIds.reduce((acc, id) => acc + masteryOf(id, s), 0) / lessonIds.length
}

/** Subscribe to just the slices mastery depends on. */
export function useMasterySlices(): MasterySlices {
  const completed = useStore((s) => s.completed)
  const quizBest = useStore((s) => s.quizBest)
  const exercisesPassed = useStore((s) => s.exercisesPassed)
  const cards = useStore((s) => s.cards)
  return { completed, quizBest, exercisesPassed, cards }
}
