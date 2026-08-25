import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSettings } from '../core/stores/settingsStore'
import { isEnabled, modules } from './moduleRegistry'
import PageLoader from './PageLoader'

export default function AppRoutes() {
  const writeEnabled = useSettings((s) => s.writeEnabled)
  const enabledPlugins = useSettings((s) => s.enabledPlugins)
  return (
    <Routes>
      {modules
        .filter((mod) => mod.id !== 'write' || writeEnabled)
        .filter((mod) => isEnabled(mod, enabledPlugins))
        .map((mod) => (
          <Route
            key={mod.id}
            path={`${mod.route}/*`}
            // Module components are lazy, so each route needs a boundary. The spinner delays its
            // own fade-in, so a chunk that lands quickly still shows nothing.
            element={
              <Suspense fallback={<PageLoader />}>
                <mod.component />
              </Suspense>
            }
          />
        ))}
      <Route path="*" element={<Navigate to={modules[0]?.route ?? '/'} replace />} />
    </Routes>
  )
}
