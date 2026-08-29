import Dexie from 'dexie'
import type { Storage, StoredRecord, TableName } from './storageInterface'
import { currentOwnerId } from './storageInterface'
import { markDirty } from '../sync/dirtyTables'

const db = new Dexie('nessuTavern')

db.version(1).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId',
  actorState: '++id, ownerId',
})

// version(1) stays declared above: Dexie needs the whole chain to upgrade an existing local DB.
db.version(2).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
})

// Phase 2 adds fields, not indexes. Declared anyway so the chain is explicit and the next
// schema change has a home.
db.version(3).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
})

// Write mode: Stories + their Chapters (segmented from day one, one Chapter per Story in v1).
db.version(4).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
})

// Kanban board cards.
// NOT INTENTIONAL: this block and the one below both declare version(5). Dexie keeps the last
// registration per version number, so this one is dead and kanbanCards was never created in any
// browser, every write to it threw. The Kanban feature has since been removed, so version(11)
// drops the table name entirely. Both blocks stay because Dexie needs the whole chain to upgrade
// an existing local database.
db.version(5).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  kanbanCards: '++id, ownerId, columnId',
})

// Duplicate version(5): this is the block Dexie actually keeps. See the comment above.
// Write v2: Macros are global (not scoped to a Story), so they get their own table. Chapters gain
// title/summary/beats/sendEnabled and Stories a direction, fields, not indexes.
db.version(5).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  macros: '++id, ownerId',
})

// Palettes: every appearance value as one named record. The built-in Default is a constant in
// code, never a row here.
db.version(6).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  macros: '++id, ownerId',
  palettes: '++id, ownerId',
})

// Backgrounds: the palette holds the settings, the image bytes get their own table so a palette
// list load doesn't pull wallpapers along with it.
db.version(7).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  macros: '++id, ownerId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
})

// Body map widget: one tracker state per chat.
db.version(8).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  macros: '++id, ownerId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
  bodyTrackers: '++id, ownerId, chatId',
})

// Saved body-map library: named maps loaded into the author, independent of any chat.
db.version(9).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  macros: '++id, ownerId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
  bodyTrackers: '++id, ownerId, chatId',
  bodyMaps: '++id, ownerId',
})

// World info entries are looked up per character, so the table gains that index. Nothing else
// changes from version(9).
db.version(10).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId, characterId',
  chats: '++id, ownerId, characterId',
  actorState: '++id, ownerId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  macros: '++id, ownerId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
  bodyTrackers: '++id, ownerId, chatId',
  bodyMaps: '++id, ownerId',
})

// Drops actorState and kanbanCards. actorState has no type and no read or write call site;
// kanbanCards never existed, since the version(5) block that declared it is dead, and the feature
// that used it is gone.
db.version(11).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId, characterId',
  chats: '++id, ownerId, characterId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  macros: '++id, ownerId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
  bodyTrackers: '++id, ownerId, chatId',
  bodyMaps: '++id, ownerId',
})

// The sampler library. Indexed on key because a connection's params reference a def by its JSON
// key, not by row id, that reference has to survive an export and a re-seed on another device.
db.version(12).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId, characterId',
  chats: '++id, ownerId, characterId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  macros: '++id, ownerId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
  bodyTrackers: '++id, ownerId, chatId',
  bodyMaps: '++id, ownerId',
  paramDefs: '++id, ownerId, key',
})

// Drops macros: saved Directions never earned their place in Write and the feature is gone. Also
// the version this Chapter.lastGeneration ships under, that's a plain field, not an index, so it
// needs no schema line of its own; the bump is the macros drop.
db.version(13).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId, characterId',
  chats: '++id, ownerId, characterId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
  bodyTrackers: '++id, ownerId, chatId',
  bodyMaps: '++id, ownerId',
  paramDefs: '++id, ownerId, key',
})

// Lorebooks become records of their own, so entries are scoped by the book they belong to rather
// than by a character. No migration: existing worldInfo rows keep a `characterId` nothing reads
// any more, per the WIP-database note in CLAUDE.md.
db.version(14).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId, bookId',
  lorebooks: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
  bodyTrackers: '++id, ownerId, chatId',
  bodyMaps: '++id, ownerId',
  paramDefs: '++id, ownerId, key',
})

function table(name: TableName) {
  return db.table<StoredRecord, number>(name)
}

// Two owner ids coexist in one IndexedDB after a sign-in, so get, find and remove filter by owner
// the way getAll always has. get and remove throw on a foreign row rather than returning undefined
// or deleting nothing: a caller holding an id from another account is a bug, and a silent no-op
// hides it.
function foreignRow(name: TableName, id: number): Error {
  return new Error(`${name} record ${id} belongs to another account.`)
}

export const storage: Storage = {
  get: async (name, id) => {
    const record = await table(name).get(id)
    if (record && record.ownerId !== currentOwnerId()) throw foreignRow(name, id)
    return record
  },
  getAll: (name) => table(name).where('ownerId').equals(currentOwnerId()).toArray(),
  // Filters rather than throws: a multi-row query has no single offending id to name, and the
  // right answer for a query is the caller's own rows.
  find: (name, field, value) =>
    table(name)
      .where(field)
      .equals(value as never)
      .and((r) => r.ownerId === currentOwnerId())
      .toArray(),
  // The four mutation functions are the whole of the app's durable writes, so marking the table
  // dirty here covers every store with no changes to any of them. markDirty runs before the write:
  // a write that throws partway through still leaves its table pending.
  put: (name, record) => {
    markDirty(name)
    return table(name).put({ ...record, ownerId: currentOwnerId() })
  },
  remove: async (name, id) => {
    const record = await table(name).get(id)
    if (record && record.ownerId !== currentOwnerId()) throw foreignRow(name, id)
    markDirty(name)
    await table(name).delete(id)
  },
  clear: (name) => {
    markDirty(name)
    return table(name).clear()
  },
  // bulkPut, not put-per-record: ids come from the file and must land unchanged.
  putAll: async (name, records) => {
    markDirty(name)
    await table(name).bulkPut(records.map((r) => ({ ...r, ownerId: currentOwnerId() })))
  },
}
