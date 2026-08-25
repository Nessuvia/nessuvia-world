/**
 * The Supabase client, for Realtime and nothing else. No auth, no database, no storage.
 *
 * Multiplayer uses Supabase as an ephemeral relay: broadcast frames and presence, never at rest.
 * Nobody signs in — the host and every guest are anonymous, on a public channel keyed by an
 * unguessable session id. Chat content lives in the host's browser and the guests' screens.
 *
 * This used to hang off `core/sync/syncClient.ts`, back when sync was an account on a server I ran.
 * Sync now talks to the user's own bucket and has no Supabase in it, so the client lives here.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Public values, from .env (dev) or .env.release. Not secrets — the anon key is meant to ship in
 *  the bundle, and it grants nothing but Realtime. */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when either value is missing from the build. Multiplayer says so and every other tab
 *  works as it always did. */
export const realtimeConfigured = Boolean(url && anonKey)

// Built on first use, not at import. createClient throws on a missing key, and that throw at module
// scope would take the whole app down instead of one tab.
let client: SupabaseClient | null = null

export function realtimeClient(): SupabaseClient {
  if (!realtimeConfigured) throw new Error('Multiplayer is not configured in this build.')
  client ??= createClient(url, anonKey)
  return client
}
