import { create } from 'zustand'
import { storage } from '../storage/db'
import { buildTablePayload } from '../storage/backup'
import { hashPayload } from '../storage/tablePayload'
import { keepDeviceFields, settingsKey } from './settingsObject'
import { decryptText, encryptText, isEncrypted } from './encrypt'
import { tableNames, type TableName } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { TablePayload } from '../storage/tablePayload'
import { useSettings } from '../stores/settingsStore'
import { withDirtySuppressed } from './dirtyTables'
import * as client from './syncClient'

/** Checked here so an oversized table fails before the request instead of as a 413. Chunking is out
 *  of scope: a partial write is worse than a refusal. */
const maxPayloadBytes = 90_000_000

export type Verdict = 'identical' | 'localOnly' | 'cloudOnly' | 'both'
export type Direction = 'push' | 'pull'

export interface TableComparison {
  verdict: Verdict
  /** The obvious direction, pre-filled. Null for `both`, which the user has to decide — an
   *  unresolved collision is refused by apply rather than settled by a default. */
  suggested: Direction | null
  /** Stamped by the store, not this device. Absent when the table has never been pushed. */
  cloudUpdatedAt: number | null
}

export type Comparison = Partial<Record<TableName, TableComparison>>

interface SyncState {
  status: 'idle' | 'comparing' | 'applying'
  error: string
  comparison: Comparison | null
  compare(): Promise<void>
  apply(decisions: Partial<Record<TableName, Direction>>): Promise<void>
  pushSettings(): Promise<void>
  pullSettings(): Promise<void>
  clearError(): void
}


function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Sync failed.'
}

export const useSync = create<SyncState>()((set, get) => ({
  status: 'idle',
  error: '',
  comparison: null,

  compare: async () => {
    set({ status: 'comparing', error: '', comparison: null })
    try {
      const manifest = await client.fetchManifest()
      const { dirtyTables, tableHashes } = useSettings.getState()
      const comparison: Comparison = {}

      for (const table of tableNames) {
        const cloud = manifest[table] ?? null
        const synced = tableHashes[table] ?? null
        // A dirty table gets hashed: the flag says it was written to, not that the content ended up
        // different. An unchanged table then costs one hash and no upload.
        const local = dirtyTables.includes(table) ? (await buildTablePayload(table)).hash : synced

        const localChanged = local !== synced
        const cloudChanged = cloud !== null && cloud.hash !== synced
        const cloudUpdatedAt = cloud?.updatedAt ?? null

        if (cloud !== null && cloud.hash === local) {
          // Both sides already agree, whatever either flag says.
          comparison[table] = { verdict: 'identical', suggested: null, cloudUpdatedAt }
          if (local) useSettings.getState().setTableSynced(table, local)
        } else if (localChanged && cloudChanged) {
          comparison[table] = { verdict: 'both', suggested: null, cloudUpdatedAt }
        } else if (cloudChanged) {
          comparison[table] = { verdict: 'cloudOnly', suggested: 'pull', cloudUpdatedAt }
        } else if (localChanged || cloud === null) {
          // cloud === null with no local change still means the cloud has nothing to show.
          comparison[table] = { verdict: 'localOnly', suggested: 'push', cloudUpdatedAt }
        } else {
          comparison[table] = { verdict: 'identical', suggested: null, cloudUpdatedAt }
        }
      }
      set({ comparison })
    } catch (err) {
      set({ error: message(err) })
    } finally {
      set({ status: 'idle' })
    }
  },

  apply: async (decisions) => {
    const comparison = get().comparison
    // A collision cannot be resolved by inaction: every both-changed table needs a direction.
    const undecided = comparison
      ? (Object.entries(comparison) as [TableName, TableComparison][])
          .filter(([table, c]) => c.verdict === 'both' && !decisions[table])
          .map(([table]) => table)
      : []
    if (undecided.length) {
      set({ error: `Choose a direction for ${undecided.join(', ')}.` })
      return
    }

    set({ status: 'applying', error: '' })
    const settings = useSettings.getState()
    const pulled: TableName[] = []
    try {
      for (const [name, direction] of Object.entries(decisions)) {
        const table = name as TableName
        if (direction === 'push') {
          const { json, hash } = await buildTablePayload(table)
          const size = new Blob([json]).size
          if (size > maxPayloadBytes) {
            throw new Error(
              `${table} is ${(size / 1_000_000).toFixed(1)} MB. The limit is ${maxPayloadBytes / 1_000_000} MB.`,
            )
          }
          await client.pushTable(table, json, hash)
          settings.setTableSynced(table, hash)
        } else {
          const object = await client.pullTable(table)
          if (!object) continue
          const payload = JSON.parse(object.json) as TablePayload
          if (payload.format !== 'nessuTavern.table' || payload.table !== table) {
            throw new Error(`${table} came back in an unrecognized format.`)
          }
          const rows = payload.rows as StoredRecord[]
          // Suppressed: a pull is not a user edit. The table is recorded clean below, with the
          // hash it was pulled at, rather than left holding whatever flag it had.
          await withDirtySuppressed(async () => {
            await storage.clear(table)
            if (rows.length) await storage.putAll(table, rows)
          })
          settings.setTableSynced(table, object.hash)
          pulled.push(table)
        }
      }
      settings.setLastSyncedAt(Date.now())
    } catch (err) {
      set({ error: message(err), status: 'idle' })
      return
    }

    // The bundled Nessuvia card and the default palettes live behind flags in settings, which are
    // not synced. Without this a second device would seed its own copies on top of the pulled rows.
    if (pulled.includes('characters')) settings.markCharactersSeeded()
    if (pulled.includes('palettes')) settings.markPalettesSeeded()
    if (pulled.includes('paramDefs')) settings.markParamDefsSeeded()

    if (pulled.length) {
      // Every store holds its rows in memory. A reload is how they all rehydrate at once.
      location.reload()
      return
    }
    set({ status: 'idle', comparison: null })
  },

  /**
   * Settings, keys and all, as their own object in the bucket. Deliberately outside the table
   * comparison: it is one small blob, it is not a table, and the two-device case is "send it from
   * the device that has the keys" rather than a merge.
   */
  pushSettings: async () => {
    set({ status: 'applying', error: '' })
    try {
      const plain = localStorage.getItem(settingsKey) ?? '{}'
      const { passphrase } = useSettings.getState().bucket
      const json = passphrase ? await encryptText(plain, passphrase) : plain
      await client.pushTable('settings', json, await hashPayload(json))
      set({ status: 'idle' })
    } catch (err) {
      set({ error: message(err), status: 'idle' })
    }
  },

  pullSettings: async () => {
    set({ status: 'applying', error: '' })
    try {
      const object = await client.pullTable('settings')
      if (!object) {
        set({ error: 'The bucket has no settings to download.', status: 'idle' })
        return
      }
      // The stored object says whether it is encrypted, not the local setting: a device that has
      // not been given the passphrase yet must fail with "wrong passphrase", not write ciphertext
      // into localStorage.
      const { passphrase } = useSettings.getState().bucket
      let json = object.json
      if (isEncrypted(json)) {
        if (!passphrase) throw new Error('The settings in this bucket are encrypted. Enter the passphrase.')
        json = await decryptText(json, passphrase)
      }
      localStorage.setItem(settingsKey, keepDeviceFields(json, localStorage.getItem(settingsKey)))
      location.reload()
    } catch (err) {
      set({ error: message(err), status: 'idle' })
    }
  },

  clearError: () => set({ error: '' }),
}))
