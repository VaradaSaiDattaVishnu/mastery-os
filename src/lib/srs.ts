// SM-2 spaced repetition (the SuperMemo-2 algorithm), lightly adapted so
// "again" reschedules within the session and grades map to four buttons.

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface CardState {
  ef: number // ease factor
  reps: number // successful reps in a row
  interval: number // days
  due: number // epoch ms
  lapses: number
  last: number
}

const DAY = 86_400_000
const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 }

export function newCard(now: number): CardState {
  return { ef: 2.5, reps: 0, interval: 0, due: now, lapses: 0, last: now }
}

export function schedule(card: CardState, grade: Grade, now: number): CardState {
  const q = QUALITY[grade]
  let { ef, reps, interval, lapses } = card

  if (q < 3) {
    reps = 0
    interval = 0
    lapses += 1
  } else {
    reps += 1
    if (reps === 1) interval = grade === 'easy' ? 3 : 1
    else if (reps === 2) interval = 6
    else interval = Math.max(1, Math.round(interval * ef * (grade === 'hard' ? 0.8 : 1)))
    ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  }

  const due = q < 3 ? now + 60_000 : now + interval * DAY
  return { ef, reps, interval, due, lapses, last: now }
}

export function isDue(card: CardState | undefined, now: number): boolean {
  return !card || card.due <= now
}

/** 0..1 retention strength, for the mastery model */
export function strength(card: CardState | undefined): number {
  if (!card || card.reps === 0) return 0
  return Math.min(1, card.interval / 21)
}
