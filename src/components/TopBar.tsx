import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { TOTAL_LESSONS } from '../curriculum/map'

export function TopBar() {
  const completed = useStore((s) => s.completed)
  const togglePalette = useStore((s) => s.togglePalette)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const done = Object.values(completed).filter(Boolean).length
  const pct = Math.round((done / TOTAL_LESSONS) * 100)

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-void/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-aurora text-[0.8rem] font-bold text-void">M</span>
          <span className="font-display text-sm tracking-tight text-ink">Mastery · OS</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-aurora" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-[0.66rem] text-ink-secondary">
              {done}/{TOTAL_LESSONS} · {pct}%
            </span>
          </div>
          <button
            onClick={() => togglePalette(true)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 font-mono text-[0.7rem] text-ink-secondary transition-colors hover:border-aurora-cyan/40 hover:text-ink"
          >
            ⌘K
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="AI settings"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-ink-secondary transition-colors hover:border-aurora-cyan/40 hover:text-ink"
          >
            ⚙
          </button>
        </div>
      </div>
    </header>
  )
}
