import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'
import type { Grade } from '../lib/srs'

export interface DeckItem {
  id: string
  front: string
  back: string
}

const GRADES: [Grade, string, string][] = [
  ['again', '#FB7185', '<1 min'],
  ['hard', '#FBBF24', ''],
  ['good', '#6EE7F9', ''],
  ['easy', '#34D399', ''],
]

export function FlashcardDeck({ items, onDone }: { items: DeckItem[]; onDone?: () => void }) {
  const gradeCard = useStore((s) => s.gradeCard)
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (items.length === 0) {
    return <p className="py-8 text-center text-ink-secondary">No cards here.</p>
  }

  if (i >= items.length) {
    return (
      <div className="py-10 text-center">
        <p className="font-display text-ink" style={{ fontSize: '1.4rem', fontWeight: 600 }}>
          Reviewed {items.length} {items.length === 1 ? 'card' : 'cards'} ✦
        </p>
        <p className="mt-2 text-ink-secondary">Spaced repetition will resurface the weak ones at the right time.</p>
        {onDone && (
          <button onClick={onDone} className="mt-5 rounded-md border border-white/10 px-4 py-2 text-sm text-ink-secondary hover:text-ink">
            Done
          </button>
        )}
      </div>
    )
  }

  const card = items[i]
  const grade = (g: Grade) => {
    gradeCard(card.id, g)
    setFlipped(false)
    setI((n) => n + 1)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between font-mono text-[0.66rem] text-ink-muted">
        <span>card {i + 1} / {items.length}</span>
        <span>space-repetition</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.button
          key={`${i}-${flipped}`}
          onClick={() => setFlipped((f) => !f)}
          className="glass-panel grid min-h-[220px] w-full place-items-center rounded-xl p-8 text-center"
          initial={{ rotateX: flipped ? -90 : 0, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div>
            <p className="mb-3 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-ink-muted">{flipped ? 'answer' : 'recall'}</p>
            <p className="text-ink" style={{ fontSize: flipped ? '1.05rem' : '1.25rem', lineHeight: 1.55, fontWeight: flipped ? 400 : 500 }}>
              {flipped ? card.back : card.front}
            </p>
            {!flipped && <p className="mt-5 font-mono text-[0.64rem] text-ink-muted">click to reveal</p>}
          </div>
        </motion.button>
      </AnimatePresence>

      {flipped && (
        <motion.div className="mt-4 grid grid-cols-4 gap-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {GRADES.map(([g, c]) => (
            <button
              key={g}
              onClick={() => grade(g)}
              className="rounded-md border py-2.5 text-sm font-medium capitalize transition-transform hover:-translate-y-0.5"
              style={{ borderColor: `${c}55`, color: c, background: `${c}11` }}
            >
              {g}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  )
}
