import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// Tab selection driven by the URL hash so the sidebar can deep-link into a page's tab.
// Falls back to the first tab when the hash is empty or unknown.
export function useHashTab<T extends string>(ids: readonly T[]): [T, (id: T) => void] {
  const { hash } = useLocation()
  const fromHash = ids.find((id) => id === hash.slice(1))
  const [tab, setTab] = useState<T>(fromHash ?? ids[0])
  useEffect(() => {
    if (fromHash) setTab(fromHash)
  }, [fromHash])
  return [tab, setTab]
}
