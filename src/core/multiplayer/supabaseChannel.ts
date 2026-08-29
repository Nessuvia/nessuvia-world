/**
 * The only file that touches Supabase Realtime. Subscribe, publish, presence, teardown.
 *
 * A transport and nothing more: events are opaque typed payloads here. Turns, rosters and the
 * Narrator are `hostSession.ts`'s business. No decision belongs in this file.
 *
 * One of two implementations of the `Channel` interface in `channel.ts`, which is what every caller
 * goes through. The other is `centrifugoChannel.ts`.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { parseEvent, withinSizeLimit } from './protocol'
import type { Channel, ChannelHandlers, PresenceMember } from './channel'
import { realtimeConfigured, realtimeClient } from './realtimeClient'

/** One broadcast event name carries every protocol event; `type` inside does the discriminating. */
const broadcastEvent = 'mp'

/** A presence row is whatever was tracked, plus Realtime's own ref. Guard the shape. */
function asMember(raw: unknown): PresenceMember | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string') return undefined
  return { id: row.id, isHost: row.isHost === true }
}

/**
 * Open the channel for a session. `me` is this client's presence identity: the host's id or a
 * guest's client-generated guestId. Throws when Realtime is not configured in this build.
 */
export function openSupabaseChannel(
  sessionId: string,
  me: PresenceMember,
  handlers: ChannelHandlers,
): Channel {
  // Checked here rather than letting realtimeClient() throw out of a network layer, so the caller
  // gets a state it can present.
  if (!realtimeConfigured) throw new Error('Multiplayer is not configured in this build.')

  const client: SupabaseClient = realtimeClient()
  // Public channel: nobody signs in, host included, so no client here has a Supabase session. If
  // the project enforces private channels that is a dashboard setting, not something to work
  // around here.
  // `self: false`: the host applies its own actions locally and broadcasts them; receiving them
  // back would double-apply.
  const channel: RealtimeChannel = client.channel(`mp:${sessionId}`, {
    config: { broadcast: { self: false }, presence: { key: me.id } },
  })

  const members = new Map<string, PresenceMember>()
  let closed = false

  channel.on('broadcast', { event: broadcastEvent }, (message) => {
    // A guest can send anything. A payload that fails to parse is dropped, not surfaced.
    const event = parseEvent((message as { payload?: unknown }).payload)
    if (event) handlers.onEvent(event)
  })

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    members.clear()
    for (const rows of Object.values(state)) {
      for (const row of rows as unknown[]) {
        const member = asMember(row)
        if (member) members.set(member.id, member)
      }
    }
  })

  channel.on('presence', { event: 'join' }, (payload) => {
    for (const row of (payload as { newPresences?: unknown[] }).newPresences ?? []) {
      const member = asMember(row)
      if (!member || member.id === me.id) continue
      members.set(member.id, member)
      handlers.onJoin(member)
    }
  })

  channel.on('presence', { event: 'leave' }, (payload) => {
    for (const row of (payload as { leftPresences?: unknown[] }).leftPresences ?? []) {
      const member = asMember(row)
      if (!member || member.id === me.id) continue
      members.delete(member.id)
      handlers.onLeave(member)
    }
  })

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void channel.track({ id: me.id, isHost: me.isHost })
      handlers.onReady()
      return
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      if (!closed) handlers.onReady(`The room connection failed (${status}).`)
    }
  })

  return {
    send(event) {
      if (closed) return false
      // Over the cap returns false rather than throwing; hostSession decides what to do.
      if (!withinSizeLimit(event)) return false
      void channel.send({ type: 'broadcast', event: broadcastEvent, payload: event })
      return true
    },

    members() {
      return [...members.values()]
    },

    close() {
      if (closed) return
      closed = true
      // Unsubscribe *and* remove: a channel left registered leaks its subscription into the next
      // session opened on the same tab.
      void client.removeChannel(channel)
      members.clear()
    },
  }
}
