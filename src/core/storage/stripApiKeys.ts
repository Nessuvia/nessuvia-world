/**
 * Connections and the sync bucket export, their secrets don't. Walks the persisted settings blob
 * and blanks every secret-bearing key by name rather than reaching into the store's shape, so a
 * moved connection list or a renamed bucket slice stays covered.
 */

/** Keys whose value is a credential. Add to this list, never to a path-specific check, a backup
 *  file gets emailed around, and a missed key is the failure that matters. */
const secretKeys = ['apiKey', 'secretAccessKey', 'accessKeyId', 'passphrase']

export function stripApiKeys(settings: string | null): string | null {
  if (settings === null) return null
  const blank = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(blank)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, secretKeys.includes(k) ? '' : blank(v)]),
      )
    return value
  }
  return JSON.stringify(blank(JSON.parse(settings)))
}
