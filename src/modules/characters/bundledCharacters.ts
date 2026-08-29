import { importCard } from './importCard'
import { parsePngCard, pngDataUrl } from '../../core/connectors/pngCard'
import type { Character } from '../../core/storage/types'

/**
 * Character cards that ship with the build. Drop a v2/v3 (or bare) card into `bundled/` (a `.json`
 * file, or a Tavern `.png` with the card in its tEXt chunk) and it seeds itself on a fresh install.
 * No list to edit. Empty folder seeds nothing.
 *
 * Runs through the same importCard() as a user import, so custom `extensions` fields are picked
 * up identically and plain Tavern cards still load. PNGs also become the avatar.
 */
const jsonFiles = import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' })
const pngUrls = import.meta.glob<string>('./bundled/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

export async function bundledCharacters(): Promise<Character[]> {
  const cards = Object.values(jsonFiles).map(importCard)
  for (const url of Object.values(pngUrls)) {
    // The PNG is an asset in our own bundle, so this is a same-origin read of a file we shipped.
    const buffer = await (await fetch(url)).arrayBuffer()
    cards.push({ ...importCard(parsePngCard(buffer)), avatar: pngDataUrl(buffer) })
  }
  return cards
}
