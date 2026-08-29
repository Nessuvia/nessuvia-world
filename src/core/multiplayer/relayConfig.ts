/**
 * Which relay a session runs on. On its own so the settings store and the channel code can import
 * it without a cycle, the same way `sync/bucketConfig.ts` sits between settings and the sync client.
 *
 * No imports of its own: `checkRelayConfig.ts` runs under node --strip-types.
 */

export type RelayKind = 'supabase' | 'centrifugo'

export interface RelayConfig {
  kind: RelayKind
  /** The Centrifugo websocket endpoint, e.g. `wss://relay.example.net/connection/websocket`.
   *  Unused and blank when `kind` is 'supabase'. */
  url: string
}

/** Supabase, because that is the relay a build ships configured for and the one that needs no
 *  setup. A self-hosted URL is something the user goes and enters. */
export const emptyRelayConfig: RelayConfig = { kind: 'supabase', url: '' }

/**
 * Whether this config can open a channel. Supabase depends on the build's env values, which this
 * file cannot see, so the caller passes that in: `channel.ts` has it from `realtimeClient.ts`.
 */
export function relayConfigured(c: RelayConfig, supabaseAvailable: boolean): boolean {
  if (c.kind === 'supabase') return supabaseAvailable
  return validRelayUrl(c.url)
}

/**
 * `wss://` only. This runs on the invite link's `?r=`, which is untrusted input arriving from
 * whoever sent the link: the same rule as an imported card. `ws://` is rejected rather than
 * allowed and left to fail: the app is served over https, so a browser blocks the plaintext socket
 * as mixed content anyway, and saying so early beats a silent connection failure.
 */
export function validRelayUrl(url: string): boolean {
  if (!url) return false
  try {
    return new URL(url).protocol === 'wss:'
  } catch {
    return false
  }
}

/** The relay's hostname, for the notice to name. '' for Supabase, which the notice names itself. */
export function relayHost(config: RelayConfig): string {
  if (config.kind !== 'centrifugo') return ''
  try {
    return new URL(config.url).host
  } catch {
    return ''
  }
}

/** The invite link for a session. Only a self-hosted relay adds a parameter, so a Supabase link is
 *  the bare path it has always been. */
export function inviteLink(origin: string, sessionId: string, config: RelayConfig): string {
  const base = `${origin}/join/${sessionId}`
  if (config.kind !== 'centrifugo') return base
  return `${base}?r=${encodeURIComponent(config.url)}`
}

/** The relay a guest should use, from the `r` parameter on the link they opened. An absent `r` is
 *  Supabase; an `r` that is not a valid wss URL is undefined, and the guest is told the link is
 *  bad rather than pointed at whatever it said. */
export function relayFromLink(r: string | null): RelayConfig | undefined {
  if (!r) return emptyRelayConfig
  if (!validRelayUrl(r)) return undefined
  return { kind: 'centrifugo', url: r }
}
