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
  /** The obvious direction, pre-filled. Null for `both`, which the user has to decide: an
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
  /** Lines from the run in progress, oldest first. Kept for the session; a pull ends in a reload,
   *  which clears it. */
  log: string[]
  compare(): Promise<void>
  apply(decisions: Partial<Record<TableName, Direction>>): Promise<void>
  pushSettings(): Promise<void>
  pullSettings(): Promise<void>
  clearError(): void
}


function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Sync failed.'
}

/** Appends one line to the run log. Hoisted, so it can reach the store it is defined above. */
function note(line: string) {
  useSync.setState((s) => ({ log: [...s.log, line] }))
}

function size(bytes: number): string {
  return bytes < 1_000_000 ? `${Math.round(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`
}

export const useSync = create<SyncState>()((set, get) => ({
  status: 'idle',
  error: '',
  comparison: null,
  log: [],

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

    set({ status: 'applying', error: '', log: [] })
    const settings = useSettings.getState()
    const pulled: TableName[] = []
    const queue = Object.entries(decisions) as [TableName, Direction][]
    note(`${queue.length} table${queue.length === 1 ? '' : 's'} to do: ${queue.map(([t]) => t).join(', ')}.`)
    try {
      for (const [name, direction] of queue) {
        const table = name as TableName
        if (direction === 'push') {
          note(`Uploading ${table}…`)
          const { json, hash } = await buildTablePayload(table)
          const bytes = new Blob([json]).size
          if (bytes > maxPayloadBytes) {
            throw new Error(
              `${table} is ${(bytes / 1_000_000).toFixed(1)} MB. The limit is ${maxPayloadBytes / 1_000_000} MB.`,
            )
          }
          await client.pushTable(table, json, hash)
          settings.setTableSynced(table, hash)
          note(`Uploaded ${table}, ${size(bytes)}.`)
        } else {
          note(`Downloading ${table}…`)
          const object = await client.pullTable(table)
          if (!object) {
            note(`${table} is not in the bucket. Skipped.`)
            continue
          }
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
          note(`Downloaded ${table}, ${rows.length} record${rows.length === 1 ? '' : 's'}.`)
        }
      }
      settings.setLastSyncedAt(Date.now())
      note(pulled.length ? 'Done. Reloading to pick up the downloaded records.' : 'Done.')
    } catch (err) {
      note(`Stopped: ${message(err)}`)
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
    set({ status: 'applying', error: '', log: [] })
    try {
      const plain = localStorage.getItem(settingsKey) ?? '{}'
      const { passphrase } = useSettings.getState().bucket
      note(passphrase ? 'Encrypting settings…' : 'Uploading settings as plain text…')
      const json = passphrase ? await encryptText(plain, passphrase) : plain
      await client.pushTable('settings', json, await hashPayload(json))
      note(`Uploaded settings, ${size(new Blob([json]).size)}. Done.`)
      set({ status: 'idle' })
    } catch (err) {
      note(`Stopped: ${message(err)}`)
      set({ error: message(err), status: 'idle' })
    }
  },

  pullSettings: async () => {
    set({ status: 'applying', error: '', log: [] })
    try {
      note('Downloading settings…')
      const object = await client.pullTable('settings')
      if (!object) {
        note('The bucket has no settings to download.')
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
        note('Decrypting settings…')
        json = await decryptText(json, passphrase)
      }
      localStorage.setItem(settingsKey, keepDeviceFields(json, localStorage.getItem(settingsKey)))
      note('Downloaded settings. Reloading.')
      location.reload()
    } catch (err) {
      note(`Stopped: ${message(err)}`)
      set({ error: message(err), status: 'idle' })
    }
  },

  clearError: () => set({ error: '' }),
}))
