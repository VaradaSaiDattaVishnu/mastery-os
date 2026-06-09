Zustand is a tiny store where components subscribe to exactly the slice they need via a selector; only the components whose slice changed re-render, with no Provider required and no boilerplate.

## The core

A Zustand store is a closure over a state object, with a `set` function and a `subscribe` function. Components call `useStore(selector)` — Zustand subscribes the component to the store and re-renders it only when the selector's return value changes by reference (shallow equal by default).

```ts
import { create } from 'zustand'

interface VoiceStore {
  isListening: boolean
  transcript: string
  sessionId: string | null
  startListening: () => void
  stopListening: () => void
  setTranscript: (t: string) => void
}

const useVoiceStore = create<VoiceStore>((set) => ({
  isListening: false,
  transcript: '',
  sessionId: null,
  startListening: () => set({ isListening: true, sessionId: crypto.randomUUID() }),
  stopListening: () => set({ isListening: false }),
  setTranscript: (transcript) => set({ transcript }),
}))
```

Components subscribe with a selector to get the minimal slice they need:

```tsx
// Only re-renders when isListening changes — not on every transcript update
function MicButton() {
  const isListening = useVoiceStore(s => s.isListening)
  const startListening = useVoiceStore(s => s.startListening)
  const stopListening = useVoiceStore(s => s.stopListening)

  return (
    <button onClick={isListening ? stopListening : startListening}>
      {isListening ? 'Stop' : 'Start'}
    </button>
  )
}

// Only re-renders when transcript changes — MicButton is unaffected
function TranscriptDisplay() {
  const transcript = useVoiceStore(s => s.transcript)
  return <p>{transcript}</p>
}
```

**Transient updates** (updates that should not trigger re-renders, e.g., mouse position tracking during drag) are handled by subscribing outside React using `useStore.subscribe`. This calls a listener on every state change without causing a re-render — useful for syncing to a canvas or WebGL scene.

```ts
// Outside React: subscribe without re-rendering
const unsub = useVoiceStore.subscribe(
  (state) => state.transcript,
  (transcript) => {
    // push to WebSocket or update a canvas overlay
    socket.send(JSON.stringify({ transcript }))
  }
)
// Call unsub() to unsubscribe
```

For derived state that should be shared across components, compute it inside the selector or create a derived store with `zustand/middleware`'s `subscribeWithSelector`.

## In your project

JARVIS's voice pipeline has rapid, high-frequency state changes during the audio-to-text loop — transcript updates, tool-call status, WebSocket frame counts. Putting all of this in React context would re-render the entire app tree on every audio chunk. The Zustand store isolates re-renders to exactly the components displaying the changing slice, keeping the UI responsive at 16ms frame budget even during active transcription.

In your Portfolio, a spatial canvas uses Zustand for pan/zoom state with the transient-update pattern: the canvas position updates on every pointer move event, but the React component tree is not involved. The transform is applied directly to a CSS variable via `document.documentElement.style.setProperty`, keeping the animation on the compositor thread.

## Tradeoffs & pitfalls

- **Selector stability**: returning a new object from a selector (`s => ({ a: s.a, b: s.b })`) re-renders on every store change. Use shallow equality: `useStore(s => ({ a: s.a, b: s.b }), shallow)` from `zustand/shallow`.
- **Store splitting**: one giant store becomes hard to tree-shake and hard to reason about. Split by domain (voiceStore, uiStore, sessionStore). Stores can read each other's state via `getState()` outside React.
- **DevTools**: Zustand has a `devtools` middleware that integrates with Redux DevTools. Skip it for transient stores (position, animation) — the serialization cost defeats the purpose.

## Top-1% insight

Zustand's `set` does a **shallow merge** by default, not a replace. `set({ transcript: 'hello' })` preserves all other keys. This is convenient but dangerous for nested state: `set({ filters: { status: 'open' } })` replaces the entire `filters` object, not merges. For nested updates, use `set(s => ({ filters: { ...s.filters, status: 'open' } }))` or the Immer middleware. Missing this distinction causes silent state loss on partial updates.
