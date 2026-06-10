import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'
import { buildTutorSystem, QUICK_ACTIONS, streamChat, type ChatMsg, type LessonCtx } from '../ai/tutor'
import { Markdown } from './Markdown'

export function AITutor({ ctx }: { ctx: LessonCtx }) {
  const provider = useStore((s) => s.provider)
  const apiKey = useStore((s) => s.apiKey)
  const model = useStore((s) => s.model)
  const baseUrl = useStore((s) => s.baseUrl)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  const system = useMemo(() => buildTutorSystem(ctx), [ctx])

  // fresh conversation per lesson
  useEffect(() => {
    setMsgs([])
    setError('')
  }, [ctx.title])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading])

  async function send(text: string) {
    if (!text.trim() || loading) return
    if (!apiKey) {
      setError('Add a free API key first.')
      return
    }
    const next: ChatMsg[] = [...msgs, { role: 'user', content: text }]
    setMsgs([...next, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    setError('')
    try {
      await streamChat({ provider, apiKey, model, baseUrl }, system, next, (delta) => {
        setMsgs((cur) => {
          const copy = cur.slice()
          const last = copy[copy.length - 1]
          if (last && last.role === 'assistant') copy[copy.length - 1] = { role: 'assistant', content: last.content + delta }
          return copy
        })
      })
    } catch (e) {
      setError((e as Error).message)
      setMsgs((cur) => {
        const c = cur.slice()
        const last = c[c.length - 1]
        if (last && last.role === 'assistant' && !last.content) c.pop()
        return c
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* launcher */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-aurora px-5 py-3 text-sm font-semibold text-void shadow-glow-violet transition-transform hover:-translate-y-0.5"
        aria-label="Open AI tutor"
      >
        <span className="animate-pulse-glow">✦</span> AI Tutor
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-void/40 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="glass-panel-active fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            >
              {/* header */}
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div>
                  <div className="font-display text-ink" style={{ fontWeight: 600 }}>
                    ✦ AI Tutor
                  </div>
                  <div className="mt-0.5 font-mono text-[0.66rem] text-ink-muted">grounded in: {ctx.title}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSettingsOpen(true)} aria-label="AI settings" className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:text-ink">
                    ⚙
                  </button>
                  <button onClick={() => setMsgs([])} aria-label="Clear chat" className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:text-ink">
                    ⟲
                  </button>
                  <button onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:text-ink">
                    ✕
                  </button>
                </div>
              </div>

              {/* quick actions */}
              <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-4 py-3">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => send(a.prompt(ctx.title, ctx.project))}
                    disabled={loading}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[0.68rem] text-ink-secondary transition-colors hover:border-aurora-violet/40 hover:text-ink disabled:opacity-40"
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* body */}
              <div ref={bodyRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {msgs.length === 0 && !loading && (
                  <div className="mt-6 text-center">
                    <p className="text-ink-secondary">Ask anything about <span className="text-ink">{ctx.title}</span>, or tap an action above.</p>
                    {!apiKey && (
                      <button onClick={() => setSettingsOpen(true)} className="mt-4 rounded-md border border-aurora-cyan/40 bg-aurora-cyan/10 px-4 py-2 text-sm text-aurora-cyan">
                        Add a free API key to begin →
                      </button>
                    )}
                  </div>
                )}
                {msgs.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={i} className="ml-auto max-w-[88%] rounded-xl rounded-tr-sm bg-aurora-violet/15 px-3.5 py-2.5 text-sm text-ink">
                      {m.content}
                    </div>
                  ) : (
                    <div key={i} className="max-w-full rounded-xl rounded-tl-sm border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                      <Markdown>{m.content}</Markdown>
                    </div>
                  ),
                )}
                {loading && !(msgs[msgs.length - 1]?.role === 'assistant' && msgs[msgs.length - 1]?.content) && (
                  <div className="flex items-center gap-1.5 text-ink-muted">
                    <span className="h-2 w-2 animate-pulse-glow rounded-full bg-aurora-cyan" />
                    <span className="font-mono text-[0.72rem]">thinking…</span>
                  </div>
                )}
                {error && <div className="rounded-md border border-aurora-pink/30 bg-aurora-pink/10 px-3 py-2 text-[0.8rem] text-aurora-pink">{error}</div>}
              </div>

              {/* input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  send(input)
                }}
                className="border-t border-white/[0.07] p-3"
              >
                <div className="flex items-end gap-2 rounded-lg border border-white/10 bg-void/60 px-3 py-2 focus-within:border-aurora-cyan/40">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        send(input)
                      }
                    }}
                    rows={1}
                    placeholder="Ask the tutor…  (Enter to send)"
                    className="max-h-32 flex-1 resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
                  />
                  <button type="submit" disabled={loading || !input.trim()} className="rounded-md bg-aurora-cyan px-3 py-1.5 text-sm font-semibold text-void disabled:opacity-40">
                    ↑
                  </button>
                </div>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
