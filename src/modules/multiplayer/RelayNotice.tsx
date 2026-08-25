/**
 * The relay disclaimer, shown once to a host and every time to a guest.
 *
 * Multiplayer is the one feature that sends anything outside the browser other than model requests.
 * Frames go through a relay: Supabase Realtime, which the developer operates, or a server the host
 * runs (`resources/self-hosted-relay.md`). Either way the relay carries plaintext, and that is a
 * fact the user should accept rather than discover — so it gates the feature instead of sitting in
 * a settings page.
 *
 * The host accepts before picking a relay, so the host's copy covers both. A guest's link already
 * says which relay the room is on, so the guest's copy names it.
 *
 * Acceptance is persisted for hosts only. `multiplayerStore.ts` holds a guest's tab to writing
 * nothing to localStorage and nothing to Dexie, and one convenience flag is not worth breaking it —
 * so `JoinView` keeps the accepted state in React and shows the notice again next session.
 */
import type { JSX } from 'react'
import type { RelayKind } from '../../core/multiplayer/relayConfig'

/** Same `nessuTavern.` prefix as the sidebar's collapse flag. Left out of backups on purpose:
 *  acceptance is per-device, not part of the user's data. */
const acceptedKey = 'nessuTavern.relayNoticeAccepted'

export function relayNoticeAccepted(): boolean {
  return localStorage.getItem(acceptedKey) === '1'
}

export function acceptRelayNotice(): void {
  localStorage.setItem(acceptedKey, '1')
}

export function RelayNotice({
  kind,
  host,
  onAccept,
}: {
  /** Undefined on the host's landing, where the notice is accepted before a relay is picked. */
  kind?: RelayKind
  /** The self-hosted relay's hostname, when there is one. */
  host?: string
  onAccept: () => void
}): JSX.Element {
  return (
    <div className="relayNotice">
      <h2>Multiplayer uses a relay</h2>
      {kind === 'centrifugo' ? (
        <>
          <p>
            Messages in a session pass through the relay server at {host || 'the address in the link'}.
            It is run by whoever sent you the link, not by the developer of this app.
          </p>
          <p>The relay carries messages in plaintext. Whoever runs it can read what passes through it.</p>
        </>
      ) : (
        <>
          <p>
            Messages in a session pass through a relay server. The default is Supabase Realtime, a
            third-party service on an account the developer holds. A host can point a session at a
            relay they run instead, set up in Settings.
          </p>
          <p>
            The relay carries messages in plaintext. On the default relay, I hold the account and
            could read what passes through it. I don&apos;t, and I have no interest in it.
          </p>
        </>
      )}
      <p>Messages are not stored on the relay.</p>
      <p>API keys are never sent to the relay. Model requests go from your browser straight to your provider.</p>
      <p>Everything outside multiplayer stays in your browser.</p>
      <button type="button" onClick={onAccept}>
        Accept
      </button>
    </div>
  )
}
