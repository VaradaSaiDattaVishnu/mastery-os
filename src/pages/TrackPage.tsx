import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { trackById } from '../curriculum/map'

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`
}

export function TrackPage() {
  const { id } = useParams<{ id: string }>()
  const track = id ? trackById(id) : undefined
  const completed = useStore((s) => s.completed)
  if (!track) return <Navigate to="/" replace />

  const lessons = track.modules.flatMap((m) => m.lessons)
  const done = lessons.filter((l) => completed[l.id]).length
  const pct = Math.round((done / lessons.length) * 100)

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-5 pb-28 pt-10">
      <Link to="/" className="font-mono text-[0.72rem] text-ink-secondary hover:text-aurora-cyan">← all tracks</Link>

      <header className="mt-5">
        <span className="h-3 w-3 rounded-full" style={{ display: 'inline-block', background: track.color, boxShadow: `0 0 12px ${track.color}` }} />
        <h1 className="mt-3 font-display text-ink" style={{ fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 600, letterSpacing: '-0.02em' }}>
          {track.title}
        </h1>
        <p className="mt-3 max-w-2xl text-ink-secondary" style={{ fontSize: '1.05rem', lineHeight: 1.6 }}>{track.tagline}</p>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 w-48 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: track.color }} />
          </div>
          <span className="font-mono text-[0.7rem]" style={{ color: track.color }}>{done}/{lessons.length} · {pct}%</span>
        </div>
      </header>

      <div className="mt-10 space-y-8">
        {track.modules.map((mod, mi) => (
          <motion.section key={mod.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: mi * 0.05 }}>
            <div className="mb-3">
              <h2 className="font-display text-ink" style={{ fontSize: '1.35rem', fontWeight: 600 }}>{mod.title}</h2>
              <p className="mt-1 text-sm text-ink-secondary">{mod.summary}</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/[0.07]">
              {mod.lessons.map((l, li) => {
                const isDone = !!completed[l.id]
                return (
                  <Link
                    key={l.id}
                    to={`/lesson/${l.id}`}
                    className="flex items-start gap-3.5 border-white/[0.06] px-4 py-3.5 transition-colors hover:bg-white/[0.03]"
                    style={{ borderTopWidth: li === 0 ? 0 : 1 }}
                  >
                    <span
                      className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[0.6rem]"
                      style={{
                        borderColor: isDone ? track.color : 'rgba(255,255,255,0.2)',
                        background: isDone ? track.color : 'transparent',
                        color: isDone ? '#06070B' : 'transparent',
                      }}
                    >
                      ✓
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink" style={{ fontSize: '0.98rem', fontWeight: 500 }}>{l.title}</span>
                        {l.project && <span className="rounded-full px-2 py-0.5 font-mono text-[0.58rem]" style={{ background: hexA(track.color, 0.12), color: hexA(track.color, 0.95) }}>{l.project}</span>}
                      </div>
                      <p className="mt-1 text-[0.85rem] text-ink-secondary" style={{ lineHeight: 1.45 }}>{l.coreIdea}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </motion.section>
        ))}
      </div>
    </div>
  )
}
