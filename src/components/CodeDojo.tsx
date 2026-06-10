import { useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { runJs, type RunResult } from '../lib/runner'
import { useStore } from '../store'
import { Markdown } from './Markdown'
import type { Exercise } from '../curriculum/types'

function ExercisePanel({ lessonId, index, ex, accent }: { lessonId: string; index: number; ex: Exercise; accent: string }) {
  const [code, setCode] = useState(ex.starter)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [showSolution, setShowSolution] = useState(false)
  const markExercise = useStore((s) => s.markExercise)
  const passedBefore = useStore((s) => !!s.exercisesPassed[`${lessonId}#${index}`])

  const run = async () => {
    setRunning(true)
    setResult(null)
    const r = await runJs(code, ex.tests)
    setResult(r)
    setRunning(false)
    if (r.ok && r.results.length > 0 && r.results.every((t) => t.passed)) {
      markExercise(`${lessonId}#${index}`, true)
    }
  }

  const allPass = result?.ok && result.results.length > 0 && result.results.every((t) => t.passed)

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <span className="font-mono text-[0.66rem] uppercase tracking-[0.18em]" style={{ color: accent }}>
          exercise {index + 1}
          {(passedBefore || allPass) && <span className="ml-2 text-aurora-cyan">✓ solved</span>}
        </span>
        <span className="font-mono text-[0.6rem] text-ink-muted">JavaScript · runs in a sandbox</span>
      </div>

      <div className="px-4 py-3">
        <Markdown>{ex.prompt}</Markdown>
      </div>

      <div className="border-y border-white/[0.06]">
        <CodeMirror
          value={code}
          onChange={setCode}
          extensions={[javascript()]}
          theme={oneDark}
          basicSetup={{ lineNumbers: true, highlightActiveLine: false, foldGutter: false }}
          minHeight="120px"
          style={{ fontSize: '0.82rem' }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          onClick={run}
          disabled={running}
          className="rounded-md px-4 py-1.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          style={{ background: accent, color: '#06070B' }}
        >
          {running ? 'Running…' : '▶ Run tests'}
        </button>
        <button onClick={() => setCode(ex.starter)} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink-secondary hover:text-ink">
          Reset
        </button>
        {ex.solution && (
          <button onClick={() => setShowSolution((v) => !v)} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink-secondary hover:text-ink">
            {showSolution ? 'Hide solution' : 'Show solution'}
          </button>
        )}
      </div>

      {result && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          {result.error && (
            <div className="mb-2 rounded-md border border-aurora-pink/30 bg-aurora-pink/10 px-3 py-2 font-mono text-[0.78rem] text-aurora-pink">
              {result.error}
            </div>
          )}
          {result.results.length > 0 && (
            <div className="space-y-1.5">
              {result.results.map((t, i) => (
                <div key={i} className="flex items-start gap-2 font-mono text-[0.78rem]">
                  <span style={{ color: t.passed ? '#34D399' : '#FB7185' }}>{t.passed ? '✓' : '✗'}</span>
                  <span className="text-ink-secondary">
                    {t.name}
                    {t.error && <span className="text-aurora-pink"> — {t.error}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {allPass && <div className="mt-3 font-mono text-[0.8rem] text-aurora-cyan">All tests passed — nice. ✦</div>}
          {result.logs.length > 0 && (
            <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-black/40 p-2.5 font-mono text-[0.72rem] text-ink-secondary">{result.logs.join('\n')}</pre>
          )}
        </div>
      )}

      {showSolution && ex.solution && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <Markdown>{'```js\n' + ex.solution + '\n```'}</Markdown>
        </div>
      )}
    </div>
  )
}

export function CodeDojo({ lessonId, exercises, accent }: { lessonId: string; exercises: Exercise[]; accent: string }) {
  return (
    <div className="space-y-5">
      {exercises.map((ex, i) => (
        <ExercisePanel key={i} lessonId={lessonId} index={i} ex={ex} accent={accent} />
      ))}
    </div>
  )
}
