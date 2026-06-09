import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'
import type { Provider } from '../ai/tutor'

export function AISettingsModal() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const provider = useStore((s) => s.provider)
  const apiKey = useStore((s) => s.apiKey)
  const model = useStore((s) => s.model)
  const baseUrl = useStore((s) => s.baseUrl)
  const setAI = useStore((s) => s.setAI)

  const [p, setP] = useState<Provider>(provider)
  const [key, setKey] = useState(apiKey)
  const [m, setM] = useState(model)
  const [url, setUrl] = useState(baseUrl)

  useEffect(() => {
    if (open) {
      setP(provider)
      setKey(apiKey)
      setM(model)
      setUrl(baseUrl)
    }
  }, [open, provider, apiKey, model, baseUrl])

  const save = () => {
    setAI({ provider: p, apiKey: key.trim(), model: m.trim() || (p === 'gemini' ? 'gemini-2.0-flash' : 'llama-3.3-70b-versatile'), baseUrl: url.trim() })
    setOpen(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(3,4,8,0.6)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            className="glass-panel-active w-full max-w-md rounded-xl p-6"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <h2 className="font-display text-xl text-ink" style={{ fontWeight: 600 }}>
              AI Tutor settings
            </h2>
            <p className="mt-1 text-sm text-ink-secondary">
              Bring your own key — stored only in your browser. A free{' '}
              <a className="text-aurora-cyan underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
                Gemini key
              </a>{' '}
              (no card) works great.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-ink-muted">provider</label>
                <div className="mt-2 flex gap-2">
                  {(['gemini', 'openai'] as Provider[]).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setP(opt)
                        setM(opt === 'gemini' ? 'gemini-2.0-flash' : 'llama-3.3-70b-versatile')
                      }}
                      className="flex-1 rounded-md border px-3 py-2 text-sm transition-colors"
                      style={{
                        borderColor: p === opt ? 'rgba(110,231,249,0.5)' : 'rgba(255,255,255,0.1)',
                        background: p === opt ? 'rgba(110,231,249,0.1)' : 'transparent',
                        color: p === opt ? '#EDEFF7' : '#9EA3B8',
                      }}
                    >
                      {opt === 'gemini' ? 'Google Gemini' : 'OpenAI-compatible'}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="api key">
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={p === 'gemini' ? 'AIza…' : 'sk-… / gsk_…'}
                  className="w-full rounded-md border border-white/10 bg-void/60 px-3 py-2 text-sm text-ink outline-none focus:border-aurora-cyan/50"
                />
              </Field>

              <Field label="model">
                <input
                  value={m}
                  onChange={(e) => setM(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-void/60 px-3 py-2 text-sm text-ink outline-none focus:border-aurora-cyan/50"
                />
              </Field>

              {p === 'openai' && (
                <Field label="base url">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://api.groq.com/openai/v1"
                    className="w-full rounded-md border border-white/10 bg-void/60 px-3 py-2 text-sm text-ink outline-none focus:border-aurora-cyan/50"
                  />
                  <p className="mt-1 text-[0.7rem] text-ink-muted">Groq: https://api.groq.com/openai/v1 · OpenAI: https://api.openai.com/v1</p>
                </Field>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md px-4 py-2 text-sm text-ink-muted hover:text-ink">
                cancel
              </button>
              <button onClick={save} className="rounded-md bg-aurora-cyan px-4 py-2 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5">
                save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-ink-muted">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  )
}
