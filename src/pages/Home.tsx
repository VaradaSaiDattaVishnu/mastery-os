import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { tracks, allLessons, TOTAL_LESSONS, locate } from '../curriculum/map'

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`
}

export function Home() {
  const completed = useStore((s) => s.completed)
  const lastLessonId = useStore((s) => s.lastLessonId)
  const apiKey = useStore((s) => s.apiKey)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const done = Object.values(completed).filter(Boolean).length
  const pct = Math.round((done / TOTAL_LESSONS) * 100)
  const continueId = lastLessonId ?? allLessons[0].id
  const continueLesson = locate(continueId)

  return (
    <div className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-12">
      {/* hero */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="py-10 text-center">
        <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-ink-secondary">your projects → the top 1%</p>
        <h1 className="mt-5 font-display text-aurora animate-drift" style={{ fontSize: 'clamp(2.6rem, 8vw, 5rem)', fontWeight: 700, letterSpacing: '-0.035em' }}>
          Mastery OS
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-ink-secondary" style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
          Every concept inside JARVIS, Unity, gharKa, the Order System and the rest — taught to the core, with an AI tutor that goes infinitely deep on demand.
        </p>

        <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-4">
          <div className="w-full">
            <div className="mb-1.5 flex justify-between font-mono text-[0.66rem] text-ink-muted">
              <span>overall mastery</span>
              <span>{done}/{TOTAL_LESSONS} · {pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-aurora transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to={`/lesson/${continueId}`} className="rounded-md bg-aurora-cyan px-5 py-2.5 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5">
              {lastLessonId ? `Continue · ${continueLesson?.lesson.title ?? ''}` : 'Start learning →'}
            </Link>
            {!apiKey && (
              <button onClick={() => setSettingsOpen(true)} className="rounded-md border border-aurora-violet/40 bg-aurora-violet/10 px-5 py-2.5 text-sm text-ink">
                ✦ Connect AI tutor (free)
              </button>
            )}
          </div>
        </div>
      </motion.section>

      {/* tracks */}
      <section className="mt-8">
        <p className="mb-5 font-mono text-[0.7rem] uppercase tracking-[0.24em] text-ink-muted">// {tracks.length} tracks · {TOTAL_LESSONS} lessons</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t, i) => {
            const lessons = t.modules.flatMap((m) => m.lessons)
            const tDone = lessons.filter((l) => completed[l.id]).length
            const tPct = Math.round((tDone / lessons.length) * 100)
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: i * 0.05 }}>
                <Link
                  to={`/track/${t.id}`}
                  className="group block h-full overflow-hidden rounded-xl border bg-surface/70 p-5 transition-all duration-300 hover:-translate-y-1"
                  style={{ borderColor: hexA(t.color, 0.18) }}
                >
                  <div className="pointer-events-none absolute" />
                  <div className="flex items-center justify-between">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}` }} />
                    <span className="font-mono text-[0.62rem] text-ink-muted">{lessons.length} lessons</span>
                  </div>
                  <h3 className="mt-3 font-display text-ink" style={{ fontSize: '1.3rem', fontWeight: 600 }}>
                    {t.title}
                  </h3>
                  <p className="mt-2 text-sm text-ink-secondary" style={{ lineHeight: 1.5 }}>
                    {t.tagline}
                  </p>
                  <div className="mt-4 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${tPct}%`, background: t.color }} />
                    </div>
                    <span className="font-mono text-[0.62rem]" style={{ color: t.color }}>{tPct}%</span>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
