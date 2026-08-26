// Round-trip fidelity: a card imported and re-exported must not lose anything it arrived with.
// Run: node --experimental-strip-types src/modules/characters/checkImportCard.ts
import assert from 'node:assert'
import type { Character, WorldInfoEntry } from '../../core/storage/types.ts'
import { buildCard } from './exportCard.ts'
import { importBook, importCard } from './importCard.ts'

const card = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: 'Ada',
    description: 'a description',
    personality: 'curious',
    scenario: 'a lab',
    first_mes: 'Hello.',
    mes_example: '<START>',
    creator_notes: 'notes from the author',
    system_prompt: 'You are {{char}}.',
    post_history_instructions: 'Stay in character.',
    alternate_greetings: ['Hi.', 'Hey.'],
    tags: ['sci-fi', 'Sci-Fi'],
    creator: 'someone',
    character_version: '1.2',
    extensions: { 'someapp/voice': 'alto', depth_prompt: { prompt: 'x', depth: 4 } },
    character_book: {
      name: 'Ada lore',
      description: 'book desc',
      scan_depth: 5,
      token_budget: 500,
      recursive_scanning: true,
      extensions: { 'someapp/bookflag': true },
      entries: [
        {
          keys: ['engine'],
          content: 'The analytical engine.',
          comment: 'Engine',
          enabled: true,
          insertion_order: 3,
          selective: true,
          secondary_keys: ['analytical'],
          position: 'after_char',
          extensions: { scan_depth: 2, probability: 50 },
        },
      ],
    },
  },
}

const c = importCard(card)

// --- import reads what we model ------------------------------------------
assert.equal(c.name, 'Ada')
assert.equal(c.firstMessage, 'Hello.')
assert.deepStrictEqual(c.alternateGreetings, ['Hi.', 'Hey.'])
assert.deepStrictEqual(c.tags, ['sci-fi', 'Sci-Fi']) // verbatim: no case folding, no dedupe
assert.equal(c.worldBook?.scanDepth, 5)
assert.equal(c.systemPrompt, 'You are {{char}}.')
assert.equal(c.postHistoryInstructions, 'Stay in character.')
assert.equal(c.creatorNotes, 'notes from the author')
assert.equal(c.creator, 'someone')
assert.equal(c.characterVersion, '1.2')

const { entries } = importBook(card)
assert.equal(entries.length, 1)
assert.equal(entries[0].name, 'Engine') // `comment` wins over the spec's `name`
assert.equal(entries[0].order, 3)
assert.equal(entries[0].scanDepth, 2) // extensions.scan_depth, not extensions.depth

// --- re-export keeps the fields we don't model ---------------------------
const stored: WorldInfoEntry[] = entries.map((e) => ({ ...e, ownerId: 'local', characterId: 1 }))
const out = buildCard({ ...c, id: 1 } as Character, stored)

assert.equal(out.data.creator_notes, 'notes from the author')
assert.equal(out.data.system_prompt, 'You are {{char}}.')
assert.equal(out.data.post_history_instructions, 'Stay in character.')
assert.equal(out.data.creator, 'someone')
assert.equal(out.data.character_version, '1.2')
assert.deepStrictEqual(out.data.tags, ['sci-fi', 'Sci-Fi'])
// Foreign extensions keys survive; ours are layered on top rather than replacing the object.
assert.equal((out.data.extensions as Record<string, unknown>)['someapp/voice'], 'alto')
assert.ok((out.data.extensions as Record<string, unknown>).nessu)
// Book-level flags we don't model come back off the original.
assert.equal(out.data.character_book?.recursive_scanning, true)
assert.deepStrictEqual(out.data.character_book?.extensions, { 'someapp/bookflag': true })
// The entry goes out as its untouched `raw`, so selective/secondary_keys/position survive.
assert.deepStrictEqual(out.data.character_book?.entries[0], card.data.character_book.entries[0])

// Editing a promoted field changes the export. This is what promoting them was for: before, these
// were read off rawCard and an edit went nowhere.
const edited = buildCard({ ...c, id: 1, creator: 'me', systemPrompt: 'new rules' } as Character, stored)
assert.equal(edited.data.creator, 'me')
assert.equal(edited.data.system_prompt, 'new rules')

// --- our own fields survive export -> import -----------------------------
const mine: Character = {
  ...c,
  displayName: 'Ada L.',
  colors: { textColor: '#fff', emphasisColor: '#f0f', boldColor: '', quoteColor: '' },
  gallery: ['https://example.com/a.png'],
  avatarCrop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 },
  paramOverrides: { contextLimit: 8192 },
  activeDescriptionIndex: 2,
  altDescriptions: [{ title: 'Alt', content: 'other' }],
}
const back = importCard(buildCard(mine, stored))
assert.equal(back.displayName, 'Ada L.')
assert.deepStrictEqual(back.colors, mine.colors)
assert.deepStrictEqual(back.gallery, mine.gallery)
assert.deepStrictEqual(back.avatarCrop, mine.avatarCrop)
assert.deepStrictEqual(back.paramOverrides, mine.paramOverrides)
assert.equal(back.activeDescriptionIndex, 2)
assert.deepStrictEqual(back.altDescriptions, mine.altDescriptions)

// A card with no nessu block lands on the defaults, not on undefined.
const bare = importCard({ name: 'Bob', description: 'b' })
assert.equal(bare.activeDescriptionIndex, -1)
assert.deepStrictEqual(bare.gallery, [])
assert.equal(bare.avatarCrop, undefined)
assert.equal(bare.paramOverrides, undefined)
assert.equal(bare.systemPrompt, '')
assert.equal(bare.creator, '')
assert.deepStrictEqual(bare.colors, { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' })
assert.equal(bare.worldBook, undefined)

// A hostile card can't smuggle a non-string into a color or the gallery.
const junk = importCard({
  name: 'X',
  extensions: { nessu: { colors: { textColor: { toString: 1 } }, gallery: [1, 'ok'], avatarCrop: { x: 'a' } } },
})
assert.equal(junk.colors.textColor, '')
assert.deepStrictEqual(junk.gallery, ['ok'])
assert.equal(junk.avatarCrop, undefined)

// A card with no name is not a card.
assert.throws(() => importCard({ description: 'nope' }), /no name/)

console.log('checkImportCard: ok')
