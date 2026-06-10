import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { allLessons } from '../curriculum/map'
import { getPractice } from '../practice'
import { useStore } from '../store'
import { FlashcardDeck, type DeckItem } from '../components/FlashcardDeck'

const NEW_PER_SESSION = 15

function buildSession(cards: Record<string, { due: number }>): { items: DeckItem[]; dueCount: number; newCount: number } {
  const now = Date.now()
  const due: DeckItem[] = []
  const fresh: DeckItem[] = []
  for (const l of allLessons) {
    const p = getPractice(l.id)
    if (!p?.flashcards) continue
    p.flashcards.forEach((c, idx) => {
      const id = `${l.id}#${idx}`
      const st = cards[id]
      const item = { id, front: c.front, back: c.back }
      if (!st) fresh.push(item)
      else if (st.due <= now) due.push(item)
    })
  }
  return { items: [...due, ...fresh.slice(0, NEW_PER_SESSION)], dueCount: due.length, newCount: fresh.length }
}

export function Review() {
  const navigate = useNavigate()
  // snapshot the session once so grading doesn't reshuffle mid-review
  const [{ items, dueCount, newCount }] = useState(() => buildSession(useStore.getState().cards))

  return (
    <div className="relative z-10 mx-auto max-w-2xl px-5 pb-28 pt-12">
      <button onClick={() => navigate('/')} className="font-mono text-[0.72rem] text-ink-secondary hover:text-aurora-cyan">← home</button>

      <header className="mt-5 text-center">
        <h1 className="font-display text-aurora" style={{ fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 700 }}>
          Daily Review
        </h1>
        <p className="mt-3 text-ink-secondary">
          {items.length > 0 ? (
            <>
              <span className="text-ink">{dueCount}</span> due · <span className="text-ink">{Math.min(newCount, NEW_PER_SESSION)}</span> new this session
            </>
          ) : (
            'Spaced repetition resurfaces concepts right before you’d forget them.'
          )}
        </p>
      </header>

      <div className="mt-10">
        {items.length > 0 ? (
          <FlashcardDeck items={items} onDone={() => navigate('/')} />
        ) : (
          <div className="glass-panel rounded-xl p-10 text-center">
            <p className="font-display text-ink" style={{ fontSize: '1.4rem', fontWeight: 600 }}>All caught up ✦</p>
            <p className="mt-2 text-ink-secondary">No cards are due. Complete more lessons to add cards, or come back later.</p>
            <button onClick={() => navigate('/atlas')} className="mt-5 rounded-md border border-white/10 px-4 py-2 text-sm text-ink-secondary hover:text-ink">
              Open the Atlas
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
