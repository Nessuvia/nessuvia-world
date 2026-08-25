import { useEffect } from 'react'
import { usePalette } from '../stores/palettesStore'

/**
 * Loads the active palette's webfont from the Fontsource CDN and clears `--chatFont` on failure so
 * the app falls back to the System Default stack rather than rendering in a font that never arrived.
 *
 * Mounted once, in App, alongside `useApplyPalette`. `useApplyPalette` writes `--chatFont` from
 * `effectiveFont`; this hook only owns the `<link>` that delivers the family. The two are separate
 * because a font stays loaded across a palette swap to another palette using the same family, and
 * because `paletteVars` is a pure var emitter that should not touch the DOM.
 */
export function useApplyWebfont() {
  const palette = usePalette()
  const { useWebfont, webfontId } = palette

  useEffect(() => {
    const id = 'webfont'
    if (!useWebfont || !webfontId) {
      document.getElementById(id)?.remove()
      return
    }

    let link = document.getElementById(id) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      // `display=swap` is not a Fontsource CSS param; the @font-face rules already set
      // font-display: swap, so a missing font falls back immediately while it loads.
      document.head.append(link)
    }
    const href = `https://cdn.jsdelivr.net/fontsource/css/${webfontId}@latest/index.css`
    if (link.getAttribute('href') === href) return

    link.setAttribute('href', href)
    // If the stylesheet itself fails to load (offline, blocked, bad id), drop the chat font var so
    // chat locations fall back to the System Default stack. A woff2 that fails after the CSS loads
    // is already handled by the `sans-serif` fallback inside the var value.
    link.onerror = () => document.documentElement.style.removeProperty('--chatFont')
  }, [useWebfont, webfontId])
}
