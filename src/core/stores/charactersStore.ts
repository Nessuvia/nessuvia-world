import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { Character } from '../storage/types'
import { emptyColors } from '../storage/types'
// ponytail: core reaching into a module, because the card parser and the bundled folder both live
// there. Move importCard into core if a second core caller ever wants it.
import { bundledCharacters } from '../../modules/characters/bundledCharacters'
import { importBook, importCard } from '../../modules/characters/importCard'
import { useWorldInfo } from './worldInfoStore'
import { useSettings } from './settingsStore'

export function newCharacter(): Character {
  return {
    ownerId: currentOwnerId(),
    name: '',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: '',
    altDescriptions: [],
    activeDescriptionIndex: -1,
    alternateGreetings: [],
    gallery: [],
    tags: [],
    systemPrompt: '',
    postHistoryInstructions: '',
    creatorNotes: '',
    creator: '',
    characterVersion: '',
    createdAt: 0,
    updatedAt: 0,
    colors: emptyColors(),
  }
}

/** Name for the UI (lists, character page, chats). {{char}} and the API payload use `name`. */
export function displayName(c: Pick<Character, 'name' | 'displayName'>): string {
  return c.displayName?.trim() || c.name
}

interface CharactersState {
  characters: Character[]
  loading: boolean
  load(): Promise<void>
  save(character: Character): Promise<number>
  /** The one card-import path: saves the character, then its lorebook against the new id. Every
   *  caller goes through here so no import route can quietly drop a book.
   *  `tags` overrides whatever the card carried — the import review screen passes the ones the user
   *  kept. Omitted (seeding, cards with no tags) means the card's own tags stand. */
  importCharacter(json: unknown, avatar?: string, tags?: string[]): Promise<number>
  remove(id: number): Promise<void>
}

export const useCharacters = create<CharactersState>()((set, get) => ({
  characters: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    // Bundled cards, seeded on first run as ordinary rows: editable, and once deleted they stay
    // gone. The flag is what makes a delete stick. Nothing in bundled/ means nothing is seeded.
    if (!useSettings.getState().seededCharacters) {
      useSettings.getState().markCharactersSeeded()
      const now = Date.now()
      for (const card of await bundledCharacters()) {
        const id = await storage.put('characters', {
          ...card,
          createdAt: now,
          updatedAt: now,
        } as unknown as StoredRecord)
        // Bundled cards go through the same book import as a user's, so a seeded character with a
        // lorebook arrives with it.
        const { entries } = importBook(card.rawCard)
        if (entries.length) await useWorldInfo.getState().addAll(id, entries)
      }
    }
    const rows = (await storage.getAll('characters')) as unknown as Character[]
    // Default `colors` for records saved before the field existed — not a migration, just a read
    // default, the same way useAppearance() re-merges appearance defaults.
    for (const c of rows) {
      c.colors = { ...emptyColors(), ...c.colors }
      c.gallery = c.gallery ?? []
      c.tags = c.tags ?? []
    }
    set({ characters: rows, loading: false })
  },

  save: async (character) => {
    const now = Date.now()
    const record = { ...character, createdAt: character.createdAt || now, updatedAt: now }
    const id = await storage.put('characters', record as unknown as StoredRecord)
    await get().load()
    return id
  },

  importCharacter: async (json, avatar, tags) => {
    const id = await get().save({
      ...importCard(json),
      ...(avatar ? { avatar } : {}),
      ...(tags ? { tags } : {}),
    })
    const { entries } = importBook(json)
    if (entries.length) await useWorldInfo.getState().addAll(id, entries)
    return id
  },

  remove: async (id) => {
    // Cascade: chats for this character, then their messages. Orphaned message rows are
    // the one data mess that's genuinely annoying to clean up later.
    for (const chat of await storage.find('chats', 'characterId', id)) {
      for (const message of await storage.find('messages', 'chatId', chat.id)) {
        await storage.remove('messages', message.id!)
      }
      await storage.remove('chats', chat.id!)
    }
    await useWorldInfo.getState().removeFor(id)
    await storage.remove('characters', id)
    await get().load()
  },
}))
