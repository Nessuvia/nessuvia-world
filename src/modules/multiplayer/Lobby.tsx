import type { JSX } from 'react'
import type { Participant } from '../../core/multiplayer/protocol'
import { Avatar } from '../../app/Avatar'

export default function Lobby({
  pending,
  onAdmit,
  onDeny,
}: {
  pending: Participant[]
  onAdmit: (guestId: string) => void
  onDeny: (guestId: string) => void
}): JSX.Element {
  if (!pending.length) {
    return <p className="lobbyEmpty">Nobody waiting.</p>
  }

  return (
    <ul className="lobbyList">
      {pending.map((guest) => (
        <li key={guest.id} className="lobbyCard">
          <div className="lobbyIdentity">
            <Avatar of={guest.avatar ? { avatar: guest.avatar } : undefined} name={guest.name} />
            <span className="lobbyName">{guest.name}</span>
          </div>
          <div className="lobbyDescription">
            {guest.description ? guest.description : <span className="lobbyNoDescription">No persona text.</span>}
          </div>
          <div className="lobbyActions">
            <button type="button" className="lobbyAdmit" onClick={() => onAdmit(guest.id)}>
              Admit
            </button>
            <button type="button" className="lobbyDeny" onClick={() => onDeny(guest.id)}>
              Deny
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
