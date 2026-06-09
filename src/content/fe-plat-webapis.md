The browser ships a platform's worth of APIs beyond the DOM — push notifications, speech recognition, local persistence — each gated by a permissions model that must be requested in a user gesture context.

## The core

**Notifications API** lets you push system-level notifications to the user. The flow: request permission (must happen in response to a user gesture), then call `new Notification()` or use the Service Worker's `showNotification` for persistent notifications.

```ts
// Request permission — must be called from a user gesture handler
async function requestAndNotify(task: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready
    // Service Worker notification persists even when the tab is closed
    await reg.showNotification('ToDoApp', {
      body: `Reminder: ${task}`,
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: 'task-reminder',       // replaces previous notification with same tag
      renotify: true,
      actions: [
        { action: 'done', title: 'Mark Done' },
        { action: 'snooze', title: 'Snooze 10min' },
      ],
    })
  } else {
    new Notification('ToDoApp', { body: task })
  }
}
```

**Web Speech API** provides `SpeechRecognition` (speech-to-text) and `SpeechSynthesis` (text-to-speech) in the browser. JARVIS uses an Edge-TTS server for higher-quality synthesis, but the browser API is sufficient for client-side speech without a backend.

```ts
// Speech recognition (browser-native STT)
const SpeechRecognition =
  window.SpeechRecognition ?? window.webkitSpeechRecognition

const recognition = new SpeechRecognition()
recognition.continuous = true
recognition.interimResults = true
recognition.lang = 'en-US'

recognition.onresult = (event: SpeechRecognitionEvent) => {
  const transcript = Array.from(event.results)
    .map(r => r[0].transcript)
    .join('')
  console.log('transcript:', transcript, 'final:', event.results[event.results.length - 1].isFinal)
}

recognition.onerror = (e) => console.error('STT error:', e.error)
recognition.start()

// Speech synthesis
function speak(text: string) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.1
  utterance.voice = speechSynthesis.getVoices().find(v => v.lang === 'en-US') ?? null
  speechSynthesis.speak(utterance)
}
```

**localStorage** provides synchronous, string-keyed persistence scoped to origin. It blocks the main thread on reads/writes and has a ~5MB limit. For structured data at higher volume, use **IndexedDB** (async, transactional, unlimited).

```ts
// localStorage — simple, synchronous, ~5MB
const save = (key: string, value: unknown) =>
  localStorage.setItem(key, JSON.stringify(value))
const load = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback }
  catch { return fallback }
}

// IndexedDB via idb wrapper — structured, async, large data
import { openDB } from 'idb'
const db = await openDB('todo-db', 1, {
  upgrade(db) { db.createObjectStore('tasks', { keyPath: 'id' }) },
})
await db.put('tasks', { id: '1', title: 'Finish lesson', done: false })
const all = await db.getAll('tasks')
```

## In your project

ToDoApp's NLP-processed tasks use `localStorage` for the task list (small, synchronous access on startup is acceptable) and the Web Notifications API for due-date reminders. JARVIS's voice loop uses `SpeechRecognition` as a fallback when the WebSocket audio stream is unavailable — the browser-native STT provides a degraded-but-working experience without any backend.

## Tradeoffs & pitfalls

- **Permission timing**: browsers block `Notification.requestPermission()` and microphone access unless called from a user gesture handler. Calling them on page load produces a prompt the user sees as spam and denies.
- **localStorage and SSR**: `localStorage` is undefined during server-side rendering. Always guard: `typeof window !== 'undefined' && localStorage.getItem(...)`.
- **SpeechRecognition and mobile Safari**: `webkitSpeechRecognition` has poor support on iOS Safari, especially with `continuous: true`. For production voice input on mobile, prefer a server-side STT (Whisper, Deepgram) over the Web Speech API.

## Top-1% insight

The **permissions model** is unified under `navigator.permissions.query({ name: 'notifications' })` — you can check permission state without triggering a prompt. The result is one of `'granted'`, `'denied'`, or `'prompt'`. Querying before calling `requestPermission` lets you skip the request when already denied (avoiding a blocked prompt that silently fails) and handle the three states differently in your UI. This pattern — query first, request on explicit user intent, handle all three states — is the professional-grade permissions flow versus the common "just call requestPermission and hope."
