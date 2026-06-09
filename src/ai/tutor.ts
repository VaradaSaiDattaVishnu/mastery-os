// Minimal, dependency-free AI tutor client.
// Default: Google Gemini (free key, browser-friendly CORS). Also supports any
// OpenAI-compatible endpoint (Groq, OpenAI, etc.) for bring-your-own.

export type Provider = 'gemini' | 'openai'

export interface AISettings {
  provider: Provider
  apiKey: string
  model: string
  baseUrl: string
}

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export interface LessonCtx {
  track: string
  module: string
  title: string
  coreIdea: string
  project?: string
  concepts: string[]
}

export function buildTutorSystem(ctx: LessonCtx): string {
  return [
    'You are an elite software-engineering mentor inside "Mastery OS", coaching Varada ("Vishnu") toward top-1% mastery.',
    'Teach to the core: how things actually work under the hood, the why, the tradeoffs, and what senior engineers know that others miss.',
    'Be precise and concrete. Use short, correct code where it clarifies. Name real systems and real pitfalls. Answer in markdown. Stay focused — no rambling, no filler.',
    `Current lesson — Track: ${ctx.track} › ${ctx.module}. Topic: "${ctx.title}". Core idea: ${ctx.coreIdea}.`,
    ctx.project ? `This concept powers his project: ${ctx.project}. Connect explanations to that project when relevant.` : '',
    `Key concepts: ${ctx.concepts.join(', ')}.`,
    'If asked to QUIZ: ask ONE question at a time, wait for the answer, then grade and explain before the next. If asked to CHALLENGE: give one concrete task, then wait for an attempt before revealing a solution.',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function tutorChat(settings: AISettings, system: string, messages: ChatMsg[]): Promise<string> {
  if (!settings.apiKey) throw new Error('No API key set. Open AI settings (key icon) to add a free key.')
  return settings.provider === 'gemini' ? geminiChat(settings, system, messages) : openaiChat(settings, system, messages)
}

async function geminiChat(s: AISettings, system: string, messages: ChatMsg[]): Promise<string> {
  const model = s.model || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(s.apiKey)}`
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 220)}`)
  const data = await res.json()
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Empty response (check model name / quota).')
  return text
}

async function openaiChat(s: AISettings, system: string, messages: ChatMsg[]): Promise<string> {
  const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({
      model: s.model || 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.6,
    }),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 220)}`)
  const data = await res.json()
  const text: string = data?.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Empty response.')
  return text
}

// Quick-action prompt builders
export const QUICK_ACTIONS: { label: string; prompt: (t: string, p?: string) => string }[] = [
  { label: 'Teach to the core', prompt: (t) => `Teach me "${t}" to the core — the internals, the why, and the key mechanics. Assume I'm sharp but want depth.` },
  { label: 'Go deeper', prompt: (t) => `Go deeper than a normal explanation of "${t}": edge cases, internals, failure modes, and what experts know that others miss.` },
  { label: 'Show me code', prompt: (t, p) => `Show me annotated, idiomatic code for "${t}"${p ? `, close to how it's used in ${p}` : ''}. Explain each key line.` },
  { label: 'Quiz me', prompt: (t) => `Quiz me on "${t}" with 5 progressively harder questions. Ask ONE at a time, wait for my answer, then grade and explain before the next.` },
  { label: 'Challenge me', prompt: (t) => `Give me one senior-level, hands-on coding or design challenge on "${t}". Then wait for my attempt before revealing a solution.` },
  { label: 'In my project', prompt: (t, p) => `Explain exactly how "${t}" works in my project ${p ?? 'my projects'} — with the kind of code and decisions I'd have made.` },
]
