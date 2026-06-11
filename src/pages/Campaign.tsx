import { useEffect, useMemo, useRef, useState } from 'react'
import { campaign, totalDays, type CampaignDay } from '../lib/campaign'

// Progress: a set of "day:taskIndex" keys in localStorage.
const KEY = 'mos-campaign-v1'

function load(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch { return new Set() }
}
function save(s: Set<string>) {
  localStorage.setItem(KEY, JSON.stringify([...s]))
}

function dayDone(d: CampaignDay, done: Set<string>) {
  return d.tasks.every((_, i) => done.has(`${d.day}:${i}`))
}

export function Campaign() {
  const [done, setDone] = useState<Set<string>>(load)
  const todayRef = useRef<HTMLDivElement>(null)

  useEffect(() => save(done), [done])

  const allDays = useMemo(() => campaign.flatMap((p) => p.entries), [])
  const today = useMemo(() => {
    const firstOpen = allDays.find((d) => !dayDone(d, done))
    return firstOpen ? firstOpen.day : totalDays
  }, [allDays, done])

  const completedDays = allDays.filter((d) => dayDone(d, done)).length
  const pct = Math.round((completedDays / totalDays) * 100)

  const toggle = (day: number, i: number) => {
    setDone((prev) => {
      const next = new Set(prev)
      const k = `${day}:${i}`
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-aurora-cyan">90-day mission</p>
      <h1 className="mt-2 font-display text-display text-ink">The Campaign</h1>
      <p className="mt-3 max-w-xl text-[0.9rem] leading-relaxed text-ink-secondary">
        One day, one mission — no deciding what to study at 11pm. Check tasks off as you finish them;
        the next unfinished day is always <span className="text-ink">today</span>.
      </p>

      {/* Progress */}
      <div className="mt-6 rounded-md border border-white/10 bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[0.7rem] text-ink-secondary">DAY {Math.min(today, totalDays)} / {totalDays}</span>
          <span className="font-mono text-[0.7rem] text-ink-secondary">{completedDays} days complete · {pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-white/5">
          <div className="h-full rounded-sm bg-aurora-cyan transition-all" style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <button
          onClick={() => todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="mt-3 rounded-sm border border-white/10 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-ink-secondary transition-colors hover:border-aurora-cyan/50 hover:text-ink"
        >
          Jump to today →
        </button>
      </div>

      {/* Phases */}
      {campaign.map((phase) => {
        const phaseDone = phase.entries.filter((d) => dayDone(d, done)).length
        return (
          <section key={phase.id} className="mt-10">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl text-ink" style={{ color: phase.color }}>{phase.title}</h2>
              <span className="font-mono text-[0.65rem] text-ink-muted">{phase.days} · {phaseDone}/{phase.entries.length}</span>
            </div>
            <p className="mt-1.5 max-w-2xl text-[0.8rem] leading-relaxed text-ink-secondary">{phase.why}</p>

            <div className="mt-4 space-y-2.5">
              {phase.entries.map((d) => {
                const isDone = dayDone(d, done)
                const isToday = d.day === today
                return (
                  <div
                    key={d.day}
                    ref={isToday ? todayRef : undefined}
                    className={`rounded-md border p-3.5 transition-colors ${
                      isToday
                        ? 'border-aurora-cyan/60 bg-aurora-cyan/5 shadow-glow-sm'
                        : isDone
                          ? 'border-white/5 bg-surface/50 opacity-60'
                          : 'border-white/10 bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-sm font-mono text-[0.65rem]"
                        style={{ background: `${phase.color}22`, color: phase.color }}
                      >
                        {isDone ? '✓' : `D${d.day}`}
                      </span>
                      <span className={`text-[0.9rem] font-medium ${isDone ? 'text-ink-muted line-through' : 'text-ink'}`}>{d.title}</span>
                      {isToday && (
                        <span className="ml-auto rounded-sm bg-aurora-cyan/15 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-aurora-cyan">today</span>
                      )}
                    </div>
                    <ul className="mt-2.5 space-y-1.5 pl-12">
                      {d.tasks.map((t, i) => {
                        const k = `${d.day}:${i}`
                        const checked = done.has(k)
                        return (
                          <li key={i} className="flex items-start gap-2.5">
                            <button
                              onClick={() => toggle(d.day, i)}
                              aria-label={checked ? 'mark not done' : 'mark done'}
                              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[0.6rem] transition-colors ${
                                checked ? 'border-aurora-cyan bg-aurora-cyan/20 text-aurora-cyan' : 'border-white/20 text-transparent hover:border-aurora-cyan/60'
                              }`}
                            >
                              ✓
                            </button>
                            <span className={`text-[0.8rem] leading-relaxed ${checked ? 'text-ink-muted line-through' : 'text-ink-secondary'}`}>
                              {t.href ? (
                                <a
                                  href={t.href}
                                  target={t.href.startsWith('http') ? '_blank' : undefined}
                                  rel="noreferrer"
                                  className="underline decoration-white/20 underline-offset-2 transition-colors hover:text-ink hover:decoration-aurora-cyan/60"
                                >
                                  {t.label}
                                </a>
                              ) : (
                                t.label
                              )}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="mt-12 text-center font-mono text-[0.65rem] text-ink-muted">
        Miss a day? Don’t reschedule — just do the next unfinished one. Streaks are vanity; the ladder is the metric.
      </p>
    </div>
  )
}
