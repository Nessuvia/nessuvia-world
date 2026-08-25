import { storage } from './db'
import { stripApiKeys } from './stripApiKeys'
import { tableNames, type StoredRecord, type TableName } from './storageInterface'
import { withDirtySuppressed } from '../sync/dirtyTables'
import { hashPayload, tablePayload } from './tablePayload'

/** The one localStorage key in the app: the persisted settings store. */
const settingsKey = 'nessuTavern.settings'

export interface Backup {
  format: 'nessuTavern.backup'
  version: 1
  exportedAt: number
  tables: Record<string, StoredRecord[]>
  localStorage: Record<string, string>
}

export async function buildBackup(): Promise<Backup> {
  const entries = await Promise.all(
    tableNames.map(async (name) => [name, await storage.getAll(name)] as const),
  )
  const settings = stripApiKeys(localStorage.getItem(settingsKey))
  return {
    format: 'nessuTavern.backup',
    version: 1,
    exportedAt: Date.now(),
    tables: Object.fromEntries(entries),
    localStorage: settings === null ? {} : { [settingsKey]: settings },
  }
}

/**
 * One table, ready to push: the payload, the exact JSON that goes over the wire, and its hash.
 * Serialized once — the push path needs the string for its size check and as the request body, and
 * the hash to skip a table that has not changed since its last push.
 *
 * Settings are deliberately absent. They never enter a table payload, which is what keeps API keys
 * on the device.
 */
export async function buildTablePayload(name: TableName) {
  const payload = tablePayload(name, await storage.getAll(name))
  const json = JSON.stringify(payload)
  return { payload, json, hash: await hashPayload(json) }
}

export function downloadBackup(backup: Backup) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  // Minutes as well as the date: exporting twice in one day is the normal case when moving between
  // devices, and two files called the same thing is how the wrong one gets imported.
  const at = new Date(backup.exportedAt).toISOString().slice(0, 16).replace('T', '-').replace(':', '')
  link.download = `nessuTavern-${at}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Untrusted file input: reject anything that isn't a backup before touching the database. */
export function parseBackup(text: string): Backup {
  const data = JSON.parse(text) as Partial<Backup>
  if (data.format !== 'nessuTavern.backup' || !data.tables) throw new Error('Not a backup file.')
  // A newer version could carry a table this build clears but cannot repopulate, so a restore from
  // one would lose data rather than fail.
  if (typeof data.version === 'number' && data.version > 1) {
    throw new Error('This backup is from a newer version of the app.')
  }
  return data as Backup
}

/** Replaces everything. The caller reloads afterwards so every store rehydrates from disk. */
export async function restoreBackup(backup: Backup) {
  // Suppressed: a restore is not a user edit, and the settings blob written below carries the
  // dirty set the backup was taken with.
  await withDirtySuppressed(async () => {
    for (const name of tableNames) {
      await storage.clear(name)
      const rows = backup.tables[name as TableName]
      if (Array.isArray(rows) && rows.length) await storage.putAll(name, rows)
    }
  })
  // Only keys the export writes, so a tampered file can't set arbitrary localStorage.
  const settings = backup.localStorage?.[settingsKey]
  localStorage.setItem(settingsKey, withSeedFlags(typeof settings === 'string' ? settings : null))
}

/**
 * A restore replaces everything, so the bundled characters, palettes and sampler defs must not be
 * written on the next load — they would show up as extras in a save the user expected to be exactly their file.
 * The flags are forced on even when the backup carries no settings blob, which is what the seeding
 * checks in charactersStore/palettesStore/paramDefsStore read.
 */
function withSeedFlags(settings: string | null): string {
  let parsed: { state?: Record<string, unknown>; version?: number } = {}
  if (settings !== null) {
    try {
      parsed = JSON.parse(settings) as typeof parsed
    } catch {
      parsed = {}
    }
  }
  const state = {
    ...(parsed.state ?? {}),
    seededPalettes: true,
    seededCharacters: true,
    seededParamDefs: true,
  }
  return JSON.stringify({ ...parsed, state })
}
