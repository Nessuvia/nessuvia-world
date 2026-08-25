import type { JSX } from 'react'
import type { RosterCharacter } from '../../core/multiplayer/protocol'
import { RiRobot2Line } from '@remixicon/react'
import { Avatar } from '../../app/Avatar'

export default function CharacterColumn({
  characters,
  narratorName,
  speakingId,
}: {
  characters: RosterCharacter[]
  narratorName: string
  speakingId?: number
}): JSX.Element {
  const isSpeaking = (id?: number) => speakingId !== undefined && speakingId === id

  return (
    <div className="characterColumn">
      {/* Narrator */}
      <div className="narratorRow">
        <span className="narratorIcon" aria-hidden="true">
          <RiRobot2Line size={20} />
        </span>
        <span className="narratorLabel">{narratorName}</span>
      </div>

      {/* Characters */}
      <div className="characterList">
        {characters.map((char) => (
          <div
            key={char.id}
            className={`characterRow ${isSpeaking(char.id) ? 'speaking' : ''}`}
          >
            <Avatar of={char.avatar ? { avatar: char.avatar } : undefined} name={char.name} />
            <span className="characterName">{char.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
