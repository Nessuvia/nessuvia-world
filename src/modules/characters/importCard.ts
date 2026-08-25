// Type-only imports on purpose: checkImportCard.ts runs this under `node --experimental-strip-types`,
// which can't resolve extensionless app imports (or boot Dexie).
import type { Character, WorldBook, WorldInfoEntry } from '../../core/storage/types'

type Loose = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Maps a parsed v3/v2/bare character card onto a Character. Timestamps come from the store. */
export function importCard(json: unknown): Character {
  const card = (json ?? {}) as Loose
  const d = ((card.data as Loose) ?? card) as Loose

  const name = str(d.name).trim()
  if (!name) throw new Error('Not a character card: no name')

  const extensions = (d.extensions as Loose) ?? {}
  const altFields = (extensions.alternate_fields as Loose) ?? {}
  const rawAlts = altFields.alt_descriptions
  const altDescriptions = (Array.isArray(rawAlts) ? rawAlts : [])
    .filter(
      (a): a is { title: string; content: string } =>
        !!a && typeof (a as Loose).title === 'string' && typeof (a as Loose).content === 'string',
    )
    .map((a) => ({ title: a.title, content: a.content }))

  return {
    ownerId: 'local', // storage.put() stamps this anyway; here only to satisfy the type
    createdAt: 0,
    updatedAt: 0,
    colors: { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' },
    avatar: '',
    name,
    // avatar stays '': `'none'` and filename strings aren't images, and JSON cards embed none.
    description: str(d.description),
    personality: str(d.personality),
    scenario: str(d.scenario),
    firstMessage: str(d.first_mes),
    exampleDialogue: str(d.mes_example),
    altDescriptions,
    // -1 on purpose: `description` already holds whichever variant the author had active.
    activeDescriptionIndex: -1,
    alternateGreetings: Array.isArray(d.alternate_greetings)
      ? d.alternate_greetings.filter((g): g is string => typeof g === 'string')
      : [],
    gallery: [],
    // Verbatim: no case folding, no dedupe, no cap. Card sites emit junk, and the review screen on
    // import plus the Tags page are where that gets sorted out — not here.
    tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
    rawCard: json,
    // Absent unless the card actually carried a book, so an empty one never shows up in the UI.
    worldBook: hasBook(json) ? importBook(json).book : undefined,
  }
}

const bookOf = (json: unknown): Loose | undefined => {
  const card = (json ?? {}) as Loose
  const d = ((card.data as Loose) ?? card) as Loose
  return (d.character_book ?? card.character_book) as Loose | undefined
}

const hasBook = (json: unknown) => !!bookOf(json)

/** An entry as it comes off a card: everything but the ids, which the store stamps on write. */
export type ImportedEntry = Omit<WorldInfoEntry, 'ownerId' | 'characterId'>

/**
 * A card's `character_book`, mapped. Both halves come back together because a card has one book:
 * `book` goes on the Character record, `entries` go in the worldInfo table.
 *
 * Cards in the wild disagree about the entry list: v2/v3 spec it as an array, older SillyTavern
 * world_info exports write an object keyed by index. Both are accepted.
 */
export function importBook(json: unknown): { book: WorldBook; entries: ImportedEntry[] } {
  const raw = bookOf(json)
  const book: WorldBook = {
    name: str(raw?.name),
    description: str(raw?.description),
    scanDepth: num(raw?.scan_depth),
    tokenBudget: num(raw?.token_budget),
  }
  const list = Array.isArray(raw?.entries)
    ? raw.entries
    : raw?.entries && typeof raw.entries === 'object'
      ? Object.values(raw.entries as Loose)
      : []

  const entries = list
    .map((item, index) => {
      const e = (item ?? {}) as Loose
      const keys = (Array.isArray(e.keys) ? e.keys : []).filter(
        (k): k is string => typeof k === 'string' && !!k.trim(),
      )
      const extensions = (e.extensions as Loose) ?? {}
      return {
        // `comment` first: the spec's own `name` is routinely empty and the label lives there.
        name: str(e.comment).trim() || str(e.name).trim() || keys[0] || 'Entry',
        keys,
        content: str(e.content),
        always: e.constant === true,
        // Anything but an explicit false is on — an absent flag means the author never turned it off.
        enabled: e.enabled !== false,
        // `extensions.scan_depth`, NOT `extensions.depth`: the latter is where SillyTavern inserts
        // the entry in history, which has nothing to do with how far back keys are scanned.
        scanDepth: num(extensions.scan_depth),
        order: num(e.insertion_order) ?? index,
        raw: item,
      }
    })
    // No content is nothing to inject, whatever the keys say.
    .filter((e) => e.content.trim())

  return { book, entries }
}
