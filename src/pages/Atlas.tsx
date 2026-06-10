import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { tracks, TOTAL_LESSONS } from '../curriculum/map'
import { masteryOf, trackMastery, useMasterySlices } from '../lib/mastery'

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`
}

export function Atlas() {
  const navigate = useNavigate()
  const slices = useMasterySlices()
  const overall = Math.round(
    (tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons.map((l) => masteryOf(l.id, slices)))).reduce((a, b) => a + b, 0) / TOTAL_LESSONS) * 100,
  )

  return (
    <div className="relative z-10 mx-auto max-w-5xl px-5 pb-28 pt-12">
      <button onClick={() => navigate('/')} className="font-mono text-[0.72rem] text-ink-secondary hover:text-aurora-cyan">← home</button>

      <header className="mt-5">
        <h1 className="font-display text-aurora" style={{ fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 700 }}>
          The Atlas
        </h1>
        <p className="mt-3 text-ink-secondary">Every concept in your projects, lit by how well you’ve mastered it — {overall}% overall. Each cell is a lesson; brightness = mastery.</p>
      </header>

      <div className="mt-10 space-y-7">
        {tracks.map((t, ti) => {
          const lessonIds = t.modules.flatMap((m) => m.lessons.map((l) => l.id))
          const tm = Math.round(trackMastery(lessonIds, slices) * 100)
          return (
            <motion.section
              key={t.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: ti * 0.04 }}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5"
            >
              <div className="flex items-center justify-between">
                <Link to={`/track/${t.id}`} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}` }} />
                  <span className="font-display text-ink" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{t.title}</span>
                </Link>
                <span className="font-mono text-[0.7rem]" style={{ color: t.color }}>{tm}%</span>
              </div>

              <div className="mt-4 space-y-3">
                {t.modules.map((m) => (
                  <div key={m.id}>
                    <p className="mb-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-ink-muted">{m.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.lessons.map((l) => {
                        const mv = masteryOf(l.id, slices)
                        return (
                          <Link
                            key={l.id}
                            to={`/lesson/${l.id}`}
                            title={`${l.title} — ${Math.round(mv * 100)}% mastered`}
                            className="grid h-9 w-9 place-items-center rounded-md border transition-transform hover:-translate-y-0.5"
                            style={{
                              borderColor: hexA(t.color, 0.25 + mv * 0.55),
                              background: hexA(t.color, 0.06 + mv * 0.5),
                              boxShadow: mv > 0.9 ? `0 0 10px ${hexA(t.color, 0.5)}` : 'none',
                            }}
                          >
                            <span className="font-mono text-[0.55rem]" style={{ color: mv > 0.5 ? '#06070B' : hexA(t.color, 0.9) }}>
                              {Math.round(mv * 100)}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          )
        })}
      </div>
    </div>
  )
}
