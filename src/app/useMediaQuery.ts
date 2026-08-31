import { useEffect, useState } from 'react'

/**
 * True while the media query matches, and re-renders when that flips. For layout that changes
 * shape rather than style: CSS handles anything a stylesheet can say on its own.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange() // the query may have changed between render and effect
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
