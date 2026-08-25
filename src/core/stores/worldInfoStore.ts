import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { WorldInfoEntry } from '../storage/types'
import type { ImportedEntry } from '../../modules/characters/importCard'

/** A blank hand-authored entry. Ordered after everything imported so it lands at the bottom. */
export function newEntry(characterId: number, order: number): WorldInfoEntry {
  return { ownerId: currentOwnerId(), characterId, name: '', keys: [], content: '', always: false, enabled: true, order }
}

const byOrder = (a: WorldInfoEntry, b: WorldInfoEntry) =>
  a.order - b.order || (a.id ?? 0) - (b.id ?? 0)

interface WorldInfoState {
  /** Entries for the character currently open in the editor — not the one that's being sent for. */
  entries: WorldInfoEntry[]
  characterId: number | null
  loadFor(characterId: number): Promise<void>
  save(entry: WorldInfoEntry): Promise<void>
  remove(id: number): Promise<void>
  /** Import: writes a whole book against a character that now has an id. */
  addAll(characterId: number, entries: ImportedEntry[]): Promise<void>
  /** Delete a character's entries — the character cascade calls this. */
  removeFor(characterId: number): Promise<void>
  /** The send path. Reads storage without touching `entries`, because the character speaking in a
   *  group chat is usually not the one open in the editor. */
  fetchFor(characterId: number): Promise<WorldInfoEntry[]>
}

export const useWorldInfo = create<WorldInfoState>()((set, get) => ({
  entries: [],
  characterId: null,

  loadFor: async (characterId) => {
    const rows = await get().fetchFor(characterId)
    set({ entries: rows, characterId })
  },

  save: async (entry) => {
    await storage.put('worldInfo', entry as unknown as StoredRecord)
    if (get().characterId === entry.characterId) await get().loadFor(entry.characterId)
  },

  remove: async (id) => {
    const characterId = get().characterId
    await storage.remove('worldInfo', id)
    if (characterId !== null) await get().loadFor(characterId)
  },

  addAll: async (characterId, entries) => {
    for (const entry of entries) {
      await storage.put('worldInfo', { ...entry, ownerId: currentOwnerId(), characterId } as unknown as StoredRecord)
    }
    if (get().characterId === characterId) await get().loadFor(characterId)
  },

  removeFor: async (characterId) => {
    for (const row of await storage.find('worldInfo', 'characterId', characterId)) {
      await storage.remove('worldInfo', row.id!)
    }
  },

  fetchFor: async (characterId) => {
    const rows = (await storage.find(
      'worldInfo',
      'characterId',
      characterId,
    )) as unknown as WorldInfoEntry[]
    return rows.sort(byOrder)
  },
}))
