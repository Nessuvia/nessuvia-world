import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './app/Sidebar'
import AppRoutes from './app/routes'
import JoinView from './modules/join/JoinView'
import PageBackground from './app/PageBackground'
import SplashScreen from './app/SplashScreen'
import { usePalettes } from './core/stores/palettesStore'
import { usePersonas } from './core/stores/personasStore'
import { useParamDefs } from './core/stores/paramDefsStore'
import { useApplyPalette } from './core/palette/useApplyPalette'
import { useApplyWebfont } from './core/palette/useApplyWebfont'

export default function App() {
  const loadPalettes = usePalettes((s) => s.load)
  const ensurePersona = usePersonas((s) => s.ensureActive)
  // The sampler library loads on boot rather than on the first visit to Settings: the send path
  // reads it synchronously to shape every request body.
  const loadParamDefs = useParamDefs((s) => s.load)
  useEffect(() => {
    loadPalettes()
    loadParamDefs()
    // A fresh install gets its "User" persona on boot, not on the first visit to Personas.
    ensurePersona()
  }, [loadPalettes, loadParamDefs, ensurePersona])
  useApplyPalette()
  useApplyWebfont()

  return (
    // useTransitions={false}: React Router 7 wraps navigation in startTransition by default, and a
    // transition keeps the current screen on screen instead of showing a Suspense fallback — so
    // PageLoader never appeared and a slow module chunk read as the page hanging.
    <BrowserRouter useTransitions={false}>
      <Routes>
        <Route path="/join/:sessionId" element={<JoinView />} />
        <Route path="*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  )
}

// Module scope, not defined inside App: a component declared in a render body is a new component
// type on every render, so React would unmount and remount this whole subtree — background fade
// and all — every time App re-renders for a palette change.
function AppShell() {
  return (
    <div className="appShell">
      <SplashScreen />
      <PageBackground />
      <Sidebar />
      <main className="appContent">
        <div className="appContentInner">
          <AppRoutes />
        </div>
      </main>
    </div>
  )
}
