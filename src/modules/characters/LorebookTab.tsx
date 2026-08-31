import { Link } from 'react-router-dom'
import type { Character } from '../../core/storage/types'
import BookAttach from '../lorebooks/BookAttach'

/**
 * The character's lorebooks. Books are records of their own now, so this is an attachment list and
 * not an editor: entries are edited once, in the Lorebooks tab, however many characters share them.
 *
 * Character level, so a book attached here applies in every chat with them. A book for one chat is
 * attached in that chat's sidebar instead.
 */
export default function LorebookTab({
  character,
  onChange,
}: {
  character: Character
  onChange: (lorebookIds: number[]) => void
}) {
  return (
    <div className="characterLorebooks">
      <BookAttach
        ids={character.lorebookIds ?? []}
        onChange={onChange}
        emptyText="No lorebooks attached."
      />
      <p className="hint">
        Applies in every chat with this character. Entries are edited in{' '}
        <Link to="/lorebooks">Lorebooks</Link>.
      </p>
    </div>
  )
}
