import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'
import { tracks, allLessons, locate } from '../curriculum/map'

interface Cmd {
  id: string
  label: string
  hint: string
  keywords: string
  run: () => void
}

export function CommandPalette() {
  const navigate = useNavigate()
  const open = useStore((s) => s.paletteOpen)
  const toggle = useStore((s) => s.togglePalette)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'home', label: 'Home / Dashboard', hint: 'nav', keywords: 'home dashboard start today', run: () => { navigate('/'); toggle(false) } },
      { id: 'review', label: 'Daily Review (spaced repetition)', hint: 'study', keywords: 'review flashcards srs recall due', run: () => { navigate('/review'); toggle(false) } },
      { id: 'atlas', label: 'Open the Atlas (skill tree)', hint: 'map', keywords: 'atlas map skill tree mastery', run: () => { navigate('/atlas'); toggle(false) } },
      { id: 'settings', label: 'AI Tutor settings', hint: 'config', keywords: 'ai key gemini settings', run: () => { setSettingsOpen(true); toggle(false) } },
      ...tracks.map((t) => ({
        id: `t-${t.id}`,
        label: `Track · ${t.title}`,
        hint: 'track',
        keywords: `${t.title} ${t.tagline}`.toLowerCase(),
        run: () => { navigate(`/track/${t.id}`); toggle(false) },
      })),
      ...allLessons.map((l) => {
        const loc = locate(l.id)
        return {
          id: `l-${l.id}`,
          label: l.title,
          hint: loc?.track.title ?? 'lesson',
          keywords: `${l.title} ${l.concepts.join(' ')} ${l.project ?? ''}`.toLowerCase(),
          run: () => { navigate(`/lesson/${l.id}`); toggle(false) },
        }
      }),
    ]
    return list
  }, [navigate, toggle, setSettingsOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 60)
    return commands
      .filter((c) => {
        const hay = `${c.label} ${c.keywords}`.toLowerCase()
        let qi = 0
        for (let i = 0; i < hay.length && qi < q.length; i++) if (hay[i] === q[qi]) qi++
        return qi === q.length
      })
      .slice(0, 60)
  }, [commands, query])

  useEffect(() => setIdx(0), [filtered])
  useEffect(() => {
    if (open) {
      setQuery('')
      const t = setTimeout(() => inputRef.current?.focus(), 40)
      return () => clearTimeout(t)
    }
  }, [open])
  useEffect(() => {
    const item = listRef.current?.children[idx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[idx]?.run() }
    else if (e.key === 'Escape') { e.preventDefault(); toggle(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center p-4"
          style={{ background: 'rgba(3,4,8,0.55)', backdropFilter: 'blur(5px)', paddingTop: '12vh' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && toggle(false)}
        >
          <motion.div
            className="glass-panel-active w-full max-w-xl overflow-hidden rounded-xl"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            onKeyDown={onKeyDown}
          >
            <input
              ref={inputRef}
              placeholder="Jump to any lesson, track, or command…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full border-b border-white/[0.08] bg-transparent px-5 py-4 text-ink outline-none placeholder:text-ink-muted"
            />
            <ul ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
              {filtered.length === 0 && <li className="px-5 py-3 font-mono text-sm text-ink-muted">no matches</li>}
              {filtered.map((c, i) => (
                <li
                  key={c.id}
                  onMouseEnter={() => setIdx(i)}
                  onClick={c.run}
                  className="mx-2 flex cursor-pointer items-center justify-between rounded-md px-3.5 py-2"
                  style={{ background: i === idx ? 'rgba(167,139,250,0.16)' : 'transparent', boxShadow: i === idx ? 'inset 2px 0 0 #a78bfa' : 'none' }}
                >
                  <span className="truncate text-ink" style={{ fontSize: '0.9rem' }}>{c.label}</span>
                  <span className="ml-3 shrink-0 font-mono text-[0.6rem] uppercase tracking-wider text-ink-muted">{c.hint}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-4 border-t border-white/[0.06] px-5 py-2.5 font-mono text-[0.62rem] text-ink-muted">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
