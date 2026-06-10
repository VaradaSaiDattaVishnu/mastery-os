import { useState } from 'react'
import { useStore } from '../store'
import type { QuizQ } from '../curriculum/types'

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`
}

export function Quiz({ lessonId, quiz, accent }: { lessonId: string; quiz: QuizQ[]; accent: string }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const recordQuiz = useStore((s) => s.recordQuiz)

  const answeredAll = quiz.every((_, i) => answers[i] != null)
  const correct = quiz.filter((q, i) => answers[i] === q.answer).length

  const submit = () => {
    setSubmitted(true)
    recordQuiz(lessonId, correct / quiz.length)
  }
  const reset = () => {
    setAnswers({})
    setSubmitted(false)
  }

  return (
    <div className="space-y-5">
      {quiz.map((q, qi) => (
        <div key={qi} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-ink" style={{ fontWeight: 500 }}>
            {qi + 1}. {q.q}
          </p>
          <div className="mt-3 space-y-2">
            {q.options.map((opt, oi) => {
              const selected = answers[qi] === oi
              const isCorrect = oi === q.answer
              let border = 'rgba(255,255,255,0.1)'
              let bg = 'transparent'
              let mark = ''
              if (submitted) {
                if (isCorrect) {
                  border = '#34D399'
                  bg = 'rgba(52,211,153,0.1)'
                  mark = '✓'
                } else if (selected) {
                  border = '#FB7185'
                  bg = 'rgba(251,113,133,0.1)'
                  mark = '✗'
                }
              } else if (selected) {
                border = accent
                bg = hexA(accent, 0.1)
              }
              return (
                <button
                  key={oi}
                  disabled={submitted}
                  onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                  className="flex w-full items-center justify-between rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors"
                  style={{ borderColor: border, background: bg, color: '#EDEFF7' }}
                >
                  <span>{opt}</span>
                  <span>{mark}</span>
                </button>
              )
            })}
          </div>
          {submitted && (
            <p className="mt-2.5 text-[0.82rem] text-ink-secondary">
              <span style={{ color: accent }}>why: </span>
              {q.explain}
            </p>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        {!submitted ? (
          <button onClick={submit} disabled={!answeredAll} className="rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-40" style={{ background: accent, color: '#06070B' }}>
            Check answers
          </button>
        ) : (
          <>
            <span className="font-display" style={{ color: accent, fontSize: '1.1rem', fontWeight: 600 }}>
              {correct}/{quiz.length} correct
            </span>
            <button onClick={reset} className="rounded-md border border-white/10 px-4 py-2 text-sm text-ink-secondary hover:text-ink">
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
