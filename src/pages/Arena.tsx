import { useEffect, useMemo, useState } from 'react'
import { getPractice } from '../practice'
import { CodeDojo } from '../components/CodeDojo'
import type { Exercise } from '../curriculum/types'

// Interleaving gym: real interviews never announce the pattern. Draw a random
// problem from the whole Gauntlet, hide which pattern it belongs to (and redact
// giveaway words from the prompt), fight the clock, reveal after.

const POOL: { id: string; pattern: string }[] = [
  { id: 'g-hash', pattern: 'Hashmap & frequency' },
  { id: 'g-twoptr', pattern: 'Two pointers' },
  { id: 'g-window', pattern: 'Sliding window' },
  { id: 'g-stack', pattern: 'Stack & monotonic stack' },
  { id: 'g-binsearch', pattern: 'Binary search' },
  { id: 'g-list', pattern: 'Linked list' },
  { id: 'g-tree-dfs', pattern: 'Tree DFS' },
  { id: 'g-tree-bfs', pattern: 'Tree BFS' },
  { id: 'g-graph', pattern: 'Graphs' },
  { id: 'g-heap', pattern: 'Heap / top-k' },
  { id: 'g-backtrack', pattern: 'Backtracking' },
  { id: 'g-dp1', pattern: 'DP (1-D)' },
  { id: 'g-dp2', pattern: 'DP (2-D)' },
  { id: 'g-intervals', pattern: 'Intervals & greedy' },
]

const REDACT = /(hash\s?map|\bMap\b|two[- ]pointers?|sliding window|monotonic( stack)?|binary[- ]search|search[- ]the[- ]answer|backtrack\w*|dynamic programming|\bdp\b|\bdp\[|prefix[- ]sum\w*|min[- ]?heap|max[- ]?heap|\bheaps?\b|\bBFS\b|\bDFS\b|flood[- ]fill|greedy|fast & slow|runners?|stack\b|queue\b|topological|Kahn'?s?( algorithm)?|recursion|recurse)/gi

interface Drawn {
  lessonId: string
  pattern: string
  index: number
  ex: Exercise
}

function drawProblem(exclude?: string): Drawn {
  for (let attempt = 0; attempt < 50; attempt++) {
    const entry = POOL[Math.floor(Math.random() * POOL.length)]
    const practice = getPractice(entry.id)
    const exs = practice?.exercises
    if (!exs?.length) continue
    const index = Math.floor(Math.random() * exs.length)
    const key = `${entry.id}#${index}`
    if (key === exclude && POOL.length > 1) continue
    return { lessonId: entry.id, pattern: entry.pattern, index, ex: exs[index] }
  }
  const fallback = getPractice('g-hash')!.exercises![0]
  return { lessonId: 'g-hash', pattern: 'Hashmap & frequency', index: 0, ex: fallback }
}

const ROUND_SECONDS = 25 * 60

export function Arena() {
  const [drawn, setDrawn] = useState<Drawn | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS)
  const [rounds, setRounds] = useState(() => Number(localStorage.getItem('mos-arena-rounds') || 0))

  // Clock runs while a problem is live and unrevealed.
  useEffect(() => {
    if (!drawn || revealed) return
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [drawn, revealed])

  const draw = () => {
    const next = drawProblem(drawn ? `${drawn.lessonId}#${drawn.index}` : undefined)
    setDrawn(next)
    setRevealed(false)
    setSecondsLeft(ROUND_SECONDS)
    const n = rounds + 1
    setRounds(n)
    localStorage.setItem('mos-arena-rounds', String(n))
  }

  const masked: Exercise | null = useMemo(() => {
    if (!drawn) return null
    if (revealed) return drawn.ex
    // Redact pattern giveaways while fighting; full prompt returns on reveal.
    return { ...drawn.ex, prompt: drawn.ex.prompt.replace(REDACT, '▮▮▮') + '\n\n*(▮▮▮ = redacted — identifying the pattern is part of the round.)*' }
  }, [drawn, revealed])

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const expired = secondsLeft === 0 && !revealed

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-aurora-pink">mock-interview mode</p>
      <h1 className="mt-2 font-display text-display text-ink">The Arena</h1>
      <p className="mt-3 max-w-xl text-[0.9rem] leading-relaxed text-ink-secondary">
        A random problem from all 14 patterns — <span className="text-ink">without telling you which</span>.
        Spotting the pattern from a cold prompt is the actual interview skill; practicing inside labeled
        chapters never trains it. 25 minutes. Narrate aloud while you work.
      </p>

      {!drawn ? (
        <button
          onClick={draw}
          className="mt-8 rounded-md border border-aurora-pink/40 bg-aurora-pink/10 px-6 py-3 font-mono text-[0.8rem] uppercase tracking-widest text-aurora-pink transition-all hover:bg-aurora-pink/20 hover:shadow-glow-sm"
        >
          ⚔ Draw a problem
        </button>
      ) : (
        <div className="mt-8">
          {/* Round bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-white/10 bg-surface px-4 py-3">
            <span className={`font-mono text-xl tabular-nums ${expired ? 'text-aurora-pink' : secondsLeft < 300 ? 'text-aurora-ember' : 'text-ink'}`}>
              {mm}:{ss}
            </span>
            {expired && <span className="font-mono text-[0.65rem] uppercase tracking-wider text-aurora-pink">time! finish the thought, then reveal</span>}
            <span className="ml-auto font-mono text-[0.65rem] text-ink-muted">round {rounds}</span>
            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="rounded-sm border border-white/15 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-ink-secondary transition-colors hover:border-aurora-cyan/50 hover:text-ink"
              >
                Reveal pattern
              </button>
            ) : (
              <span className="rounded-sm bg-aurora-cyan/15 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-aurora-cyan">
                {drawn.pattern} — <a className="underline underline-offset-2" href={`#/lesson/${drawn.lessonId}`}>open the card</a>
              </span>
            )}
            <button
              onClick={draw}
              className="rounded-sm border border-white/15 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-ink-secondary transition-colors hover:border-aurora-pink/50 hover:text-ink"
            >
              Next ⚔
            </button>
          </div>

          {/* The fight */}
          {masked && (
            <div className="mt-4">
              <CodeDojo
                key={`${drawn.lessonId}#${drawn.index}#${revealed}`}
                lessonId={`arena:${drawn.lessonId}#${drawn.index}`}
                exercises={[masked]}
                accent="#F472B6"
              />
            </div>
          )}

          <p className="mt-4 font-mono text-[0.65rem] leading-relaxed text-ink-muted">
            Protocol: name the pattern aloud before typing → solve → green tests → say the complexity script →
            reveal to confirm → next. If you needed the reveal to identify it, that pattern goes on tomorrow’s re-solve list.
          </p>
        </div>
      )}
    </div>
  )
}
