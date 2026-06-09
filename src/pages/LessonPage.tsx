import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { allLessons, locate } from '../curriculum/map'
import { getLessonBody } from '../content'
import { Markdown } from '../components/Markdown'
import { AITutor } from '../components/AITutor'

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`
}

export function LessonPage() {
  const { id } = useParams<{ id: string }>()
  const completed = useStore((s) => s.completed)
  const toggleComplete = useStore((s) => s.toggleComplete)
  const visit = useStore((s) => s.visit)

  const loc = id ? locate(id) : undefined

  useEffect(() => {
    window.scrollTo(0, 0)
    if (id && loc) visit(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!id || !loc) return <Navigate to="/" replace />
  const { track, module, lesson } = loc
  const accent = track.color
  const body = getLessonBody(id)
  const isDone = !!completed[id]

  const i = allLessons.findIndex((l) => l.id === id)
  const prev = i > 0 ? allLessons[i - 1] : undefined
  const next = i < allLessons.length - 1 ? allLessons[i + 1] : undefined

  return (
    <div className="relative z-10 mx-auto max-w-3xl px-5 pb-32 pt-10">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 font-mono text-[0.7rem] text-ink-muted">
        <Link to={`/track/${track.id}`} className="hover:text-aurora-cyan" style={{ color: hexA(accent, 0.9) }}>
          {track.title}
        </Link>
        <span>›</span>
        <span>{module.title}</span>
      </div>

      {/* header */}
      <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="mt-4">
        <h1 className="font-display text-ink" style={{ fontSize: 'clamp(1.9rem,5vw,3rem)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
          {lesson.title}
        </h1>
        <p className="mt-4 border-l-2 pl-4 text-ink" style={{ borderColor: accent, fontSize: '1.12rem', lineHeight: 1.5 }}>
          {lesson.coreIdea}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {lesson.project && (
            <span className="rounded-full px-3 py-1 font-mono text-[0.66rem]" style={{ background: hexA(accent, 0.12), color: hexA(accent, 0.95) }}>
              in your project · {lesson.project}
            </span>
          )}
          {lesson.concepts.map((c) => (
            <span key={c} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[0.66rem] text-ink-secondary">
              {c}
            </span>
          ))}
        </div>
      </motion.header>

      <hr className="my-8 border-white/[0.07]" />

      {/* body */}
      {body ? (
        <Markdown>{body}</Markdown>
      ) : (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-ink-secondary">
          <p className="text-ink" style={{ fontWeight: 500 }}>Deep lesson is coming online.</p>
          <p className="mt-2 text-sm">
            Meanwhile, open the <span className="text-aurora-cyan">✦ AI Tutor</span> (bottom-right) and hit <em>Teach to the core</em> — it’s grounded in this exact topic and your project.
          </p>
        </div>
      )}

      {/* complete + nav */}
      <div className="mt-12 flex flex-col gap-6">
        <button
          onClick={() => toggleComplete(id)}
          className="self-start rounded-md px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          style={
            isDone
              ? { border: `1px solid ${hexA(accent, 0.5)}`, color: accent, background: hexA(accent, 0.08) }
              : { background: accent, color: '#06070B' }
          }
        >
          {isDone ? '✓ Completed — mark as not done' : 'Mark lesson complete'}
        </button>

        <div className="grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link to={`/lesson/${prev.id}`} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition-all hover:-translate-y-0.5 hover:border-white/20">
              <div className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-ink-muted">← previous</div>
              <div className="mt-1 text-ink" style={{ fontWeight: 500 }}>{prev.title}</div>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={`/lesson/${next.id}`} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-right transition-all hover:-translate-y-0.5 hover:border-white/20">
              <div className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-ink-muted">next →</div>
              <div className="mt-1 text-ink" style={{ fontWeight: 500 }}>{next.title}</div>
            </Link>
          )}
        </div>
      </div>

      <AITutor
        ctx={{
          track: track.title,
          module: module.title,
          title: lesson.title,
          coreIdea: lesson.coreIdea,
          project: lesson.project,
          concepts: lesson.concepts,
        }}
      />
    </div>
  )
}
