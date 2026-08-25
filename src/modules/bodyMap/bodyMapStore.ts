import { create } from 'zustand'
import { storage } from '../../core/storage/db'
import { currentOwnerId } from '../../core/storage/storageInterface'
import type { StoredRecord } from '../../core/storage/storageInterface'
import type {
  AppliedAction,
  BodyMap,
  HostContext,
  SendMode,
  TrackerState,
} from './types'
import { emptyTracker } from './types'
import { buildBlock } from './output'
import { defaultBodyMap } from './defaultMap'

// Host-side glue for the body map widget. Owns persistence (one TrackerState per chat, in Dexie)
// and exposes the current output block to whoever sends messages. The widget component itself
// stays decoupled — it takes state + callbacks as props (see the plugin's host contract).

interface TrackerRow extends StoredRecord {
  id?: number
  ownerId: string
  chatId: number
  state: TrackerState
}

interface MapRow extends StoredRecord {
  id?: number
  ownerId: string
  map: BodyMap
}

/** A saved library map plus its Dexie row id (the stable handle for overwrite/delete). */
export interface SavedMap {
  rowId: number
  map: BodyMap
}

interface BodyMapState {
  chatId: number | null
  tracker: TrackerState
  map: BodyMap
  /** The saved library of maps (man, woman, non-human, …), loaded by the author. */
  savedMaps: SavedMap[]
  /** Load the saved tracker for a chat (or a fresh empty one) and the map it points at. */
  open(chatId: number): Promise<void>
  /** Point this chat at a saved map (or null for the bundled figure) and persist the choice. */
  setMapRow(rowId: number | null): Promise<void>
  /** Refresh `savedMaps` from storage. */
  loadMaps(): Promise<void>
  /** Insert or overwrite a library map. Pass `rowId` to overwrite; omit to add. Returns the id. */
  saveMap(map: BodyMap, rowId?: number): Promise<number>
  /** Delete a library map by its row id. */
  deleteMap(rowId: number): Promise<void>
  /** Replace the whole tracker and persist. */
  setTracker(next: TrackerState): Promise<void>
  addAction(partId: string, action: AppliedAction): Promise<void>
  removeAction(partId: string, index: number): Promise<void>
  /** Replace one action in place, keeping its position in the part's list. */
  updateAction(partId: string, index: number, action: AppliedAction): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
  setSendMode(mode: SendMode): Promise<void>
  setTag(tag: string): Promise<void>
  /** The current output block for a given host context; '' when empty/disabled. */
  payload(ctx: HostContext): string
}

/** The map a tracker points at, or the bundled figure when the row is unset or gone. */
function mapFor(rowId: number | undefined, saved: SavedMap[]): BodyMap {
  if (rowId == null) return defaultBodyMap
  return saved.find((s) => s.rowId === rowId)?.map ?? defaultBodyMap
}

async function persist(chatId: number, state: TrackerState) {
  const rows = (await storage.find('bodyTrackers', 'chatId', chatId)) as unknown as TrackerRow[]
  const existing = rows[0]
  await storage.put('bodyTrackers', {
    ...(existing?.id ? { id: existing.id } : {}),
    ownerId: currentOwnerId(),
    chatId,
    state,
  } as unknown as StoredRecord)
}

export const useBodyMap = create<BodyMapState>()((set, get) => ({
  chatId: null,
  tracker: emptyTracker(),
  map: defaultBodyMap,
  savedMaps: [],

  open: async (chatId) => {
    const rows = (await storage.find('bodyTrackers', 'chatId', chatId)) as unknown as TrackerRow[]
    const tracker = rows[0]?.state ?? emptyTracker()
    set({ chatId, tracker })
    await get().loadMaps()
    set({ map: mapFor(tracker.mapRowId, get().savedMaps) })
  },

  setMapRow: async (rowId) => {
    set({ map: mapFor(rowId ?? undefined, get().savedMaps) })
    const t = get().tracker
    await get().setTracker({ ...t, mapRowId: rowId ?? undefined })
  },

  loadMaps: async () => {
    const rows = (await storage.getAll('bodyMaps')) as unknown as MapRow[]
    set({ savedMaps: rows.filter((r) => r.id != null).map((r) => ({ rowId: r.id!, map: r.map })) })
  },

  saveMap: async (map, rowId) => {
    const id = await storage.put('bodyMaps', {
      ...(rowId != null ? { id: rowId } : {}),
      ownerId: currentOwnerId(),
      map,
    } as unknown as StoredRecord)
    await get().loadMaps()
    return id
  },

  deleteMap: async (rowId) => {
    await storage.remove('bodyMaps', rowId)
    await get().loadMaps()
  },

  setTracker: async (next) => {
    set({ tracker: next })
    const { chatId } = get()
    if (chatId != null) await persist(chatId, next)
  },

  addAction: async (partId, action) => {
    const t = get().tracker
    const parts = { ...t.parts, [partId]: [...(t.parts[partId] ?? []), action] }
    await get().setTracker({ ...t, parts })
  },

  removeAction: async (partId, index) => {
    const t = get().tracker
    const list = (t.parts[partId] ?? []).filter((_, i) => i !== index)
    const parts = { ...t.parts }
    if (list.length) parts[partId] = list
    else delete parts[partId]
    await get().setTracker({ ...t, parts })
  },

  updateAction: async (partId, index, action) => {
    const t = get().tracker
    const list = t.parts[partId]
    if (!list?.[index]) return
    const parts = { ...t.parts, [partId]: list.map((a, i) => (i === index ? action : a)) }
    await get().setTracker({ ...t, parts })
  },

  setEnabled: async (enabled) => get().setTracker({ ...get().tracker, enabled }),
  setSendMode: async (sendMode) => get().setTracker({ ...get().tracker, sendMode }),
  setTag: async (tag) => get().setTracker({ ...get().tracker, tag }),

  payload: (ctx) => buildBlock(get().tracker, get().map, ctx),
}))
