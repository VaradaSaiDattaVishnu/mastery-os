import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store'
import { TopBar } from './components/TopBar'
import { CommandPalette } from './components/CommandPalette'
import { AISettingsModal } from './components/AISettingsModal'
import { Home } from './pages/Home'
import { TrackPage } from './pages/TrackPage'
import { LessonPage } from './pages/LessonPage'
import { Review } from './pages/Review'
import { Atlas } from './pages/Atlas'

function GlobalKeys() {
  const togglePalette = useStore((s) => s.togglePalette)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        togglePalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePalette])
  return null
}

export default function App() {
  return (
    <HashRouter>
      <div className="aurora-bg" aria-hidden />
      <GlobalKeys />
      <TopBar />
      <main className="relative">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/track/:id" element={<TrackPage />} />
          <Route path="/lesson/:id" element={<LessonPage />} />
          <Route path="/review" element={<Review />} />
          <Route path="/atlas" element={<Atlas />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <CommandPalette />
      <AISettingsModal />
    </HashRouter>
  )
}
