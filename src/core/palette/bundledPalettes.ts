import { parsePalettes } from './importPalettes'

/**
 * Palette files that ship with the build. Drop an exported `.json` into `bundled/` and it seeds
 * itself on a fresh install — no list to edit.
 *
 * Each file is parsed on its own: image ids are per-file, so they have to be remapped per file too.
 */
const files = import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' })

export function bundledPalettes() {
  // stringify to reuse the import path's coercion rather than a second parser.
  return Object.values(files).map((file) => parsePalettes(JSON.stringify(file)))
}
